package org.georchestra.ldapadmin.ws.backoffice.groups;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

public class GroupProtected {

	private static final Log LOG = LogFactory.getLog(GroupProtected.class.getName());

	private Set<String> listOfprotectedGroups = new HashSet<String>();

	public GroupProtected() {
	}

	public Set<String> getListOfprotectedGroups() {
		return listOfprotectedGroups;
	}

	public void setListOfprotectedGroups(String[] listOfprotectedGroups) {

		HashSet<String> res = new HashSet<String>();
		res.addAll(Arrays.asList(listOfprotectedGroups));
		this.listOfprotectedGroups = res;

	}

	/**
	 * True if the Groups is a protected groups
	 * 
	 * @param uid
	 *            uid of group
	 * 
	 * @return True if the Groups is a protected groups
	 */
	public boolean isProtected(final String uid) {

		if (this.listOfprotectedGroups.isEmpty())
			GroupProtected.LOG.warn("There isn't any protected groups configured");

		for (String reg : listOfprotectedGroups) {
			if (Pattern.matches(reg, uid))
				return true;
		}

		return false;
	}
}
