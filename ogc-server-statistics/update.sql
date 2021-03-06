﻿BEGIN;

CREATE OR REPLACE FUNCTION get_partition_table(my_date date)
  RETURNS character varying AS
$BODY$
DECLARE
    my_table_name character varying;
    my_month character varying;
    my_year character varying;
    borne_sup date;
    borne_inf date;
    query character varying;
    base_table_name character varying = 'ogc_services_log';
    base_schema_name character varying = 'ogcstatistics';
BEGIN

	-- Generate table name
	my_month := EXTRACT(MONTH FROM my_date);
	my_year := EXTRACT(YEAR FROM my_date);
	
	my_table_name := base_table_name || '_y' || my_year || 'm' || my_month;

	-- RAISE NOTICE 'table name %.%', base_schema_name, my_table_name;

	-- Test if table already exists
	IF NOT (SELECT count(*) > 0 
	        FROM information_schema.tables 
	        WHERE table_schema = base_schema_name
		AND table_name = my_table_name) THEN

		borne_inf := (my_year || '-' || my_month || '-01')::date;
		borne_sup := borne_inf + INTERVAL '1 month';

		query := 'CREATE TABLE ' || base_schema_name || '.' || my_table_name || '( CHECK ( date >= DATE ''' || borne_inf || ''' AND date < DATE ''' || borne_sup || ''' ) ';
		query := query || ') INHERITS (' || base_schema_name || '.' || base_table_name || ')';

		-- Create table if it does not exists
		EXECUTE query;

	END IF;

	RETURN base_schema_name || '.' || my_table_name;
	
END;
$BODY$
  LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION get_partition_table(date) IS 'Table name that correspond to specified date, also create this table if it does not exists';



CREATE OR REPLACE FUNCTION insert_stat_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
	table_name character varying;
BEGIN

	table_name := get_partition_table(NEW.date);

	-- insert record in child table
	EXECUTE 'INSERT INTO ' || table_name || ' VALUES ($1.*)' USING NEW;

	-- do *not* insert record in master table
	RETURN NULL;

END;
$$
LANGUAGE plpgsql;



-- Prevent application to add records to old version of ogc_services_log table
ALTER TABLE ogcstatistics.ogc_services_log RENAME TO ogc_services_log_old;

-- Create new version of ogc_services_log table
CREATE TABLE ogcstatistics.ogc_services_log(
  user_name character varying(255),
  date timestamp without time zone,
  service character varying(5),
  layer character varying(255),
  id bigserial,
  request character varying(20),
  org character varying(255),
	roles text[]
);


CREATE TRIGGER insert_stat_trigger
    BEFORE INSERT ON ogcstatistics.ogc_services_log
    FOR EACH ROW EXECUTE PROCEDURE insert_stat_trigger_function();


-- Add roles column
ALTER TABLE ogcstatistics.ogc_services_log_old ADD COLUMN roles text[];


-- Populate roles in old table
/*
 *
 * Here you should add UPDATE statments generated by populate_stats_roles.py python script and remove ROLLBACK statement.
 *
 * For testing purpose, you can run following query to fill roles colmumn with fake values
 * UPDATE ogcstatistics.ogc_services_log_old SET roles = 
 * ARRAY[
 *  (ARRAY['ADMINISTRATOR','MOD_LDAPADMIN','MOD_ANALYTICS','MOD_EXTRACTORAPP','SV_ADMIN','SV_EDITOR','SV_REVIEWER'])[(random()*(7 -1) )::int + 1],
 *  (ARRAY['ADMINISTRATOR','MOD_LDAPADMIN','MOD_ANALYTICS','MOD_EXTRACTORAPP','SV_ADMIN','SV_EDITOR','SV_REVIEWER'])[(random()*(7 -1) )::int + 1],
 *  (ARRAY['ADMINISTRATOR','MOD_LDAPADMIN','MOD_ANALYTICS','MOD_EXTRACTORAPP','SV_ADMIN','SV_EDITOR','SV_REVIEWER'])[(random()*(7 -1) )::int + 1]]
 */

ROLLBACK;


-- Copy records to new table (2.6 hours with 66M records)
INSERT INTO ogcstatistics.ogc_services_log SELECT * FROM ogcstatistics.ogc_services_log_old;


/*
 *
 * Now ogcstatistics.ogc_services_log_old can be dropped
 *
 */

COMMIT;

