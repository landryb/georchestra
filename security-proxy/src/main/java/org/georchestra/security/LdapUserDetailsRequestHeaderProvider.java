/*
 * Copyright (C) 2009-2018 by the geOrchestra PSC
 *
 * This file is part of geOrchestra.
 *
 * geOrchestra is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * geOrchestra is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * geOrchestra.  If not, see <http://www.gnu.org/licenses/>.
 */

package org.georchestra.security;

import static org.georchestra.security.HeaderNames.SEC_ORG;
import static org.georchestra.security.HeaderNames.SEC_ORGNAME;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import javax.annotation.Nullable;
import javax.annotation.PostConstruct;
import javax.naming.NamingEnumeration;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.http.Header;
import org.apache.http.message.BasicHeader;
import org.georchestra.commons.configuration.GeorchestraConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.ldap.core.DirContextOperations;
import org.springframework.ldap.core.LdapTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.ldap.search.FilterBasedLdapUserSearch;
import org.springframework.util.Assert;

import com.google.common.base.Predicates;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.Maps;

/**
 * Reads information from a user node in LDAP and adds the information as
 * headers to the request.
 * <p>
 * Adds the remaining standard request headers {@code sec-org} and
 * {@code sec-orgname} (while {@link SecurityRequestHeaderProvider} adds
 * {@code sec-username} and {@code sec-roles}), and then any extra request
 * header that can be extracted from the user's LDAP info and is configured in
 * the datadirectory's {@code security-proxy/headers-mapping.properties} file.
 * 
 * @author jeichar
 * @see SecurityRequestHeaderProvider
 */
public class LdapUserDetailsRequestHeaderProvider extends HeaderProvider {

    private static final String CACHED_USERNAME_KEY = "security-proxy-cached-username";

    private static final String CACHED_HEADERS_KEY = "security-proxy-cached-attrs";

    protected static final Log logger = LogFactory
            .getLog(LdapUserDetailsRequestHeaderProvider.class.getPackage().getName());

    private final FilterBasedLdapUserSearch _userSearch;
    private final Pattern orgSeachMemberOfPattern;
    private final String orgSearchBaseDN;

    private Map<String, String> _headerMapping = ImmutableMap.of();

    @Autowired
    private LdapTemplate ldapTemplate;

    @Autowired
    private GeorchestraConfiguration georchestraConfiguration;

    public LdapUserDetailsRequestHeaderProvider(FilterBasedLdapUserSearch userSearch, String orgSearchBaseDN) {
        Assert.notNull(userSearch, "userSearch must not be null");
        // Q: is it ok for orgSearchBaseDN to be null?
        this._userSearch = userSearch;
        this.orgSearchBaseDN = orgSearchBaseDN;
        this.orgSeachMemberOfPattern = Pattern.compile("([^=,]+)=([^=,]+)," + orgSearchBaseDN + ".*");
    }

    @PostConstruct
    public void init() throws IOException {
        final boolean loadExternalConfig = (georchestraConfiguration != null) && (georchestraConfiguration.activated());
        if (loadExternalConfig) {
            Properties pHmap = georchestraConfiguration.loadCustomPropertiesFile("headers-mapping");
            _headerMapping = Maps.fromProperties(pHmap);
        }
    }

    public void setHeadersMapping(Map<String, String> headerNameToLdapPropMappings) {
        this._headerMapping = headerNameToLdapPropMappings == null ? ImmutableMap.of()
                : ImmutableMap.copyOf(headerNameToLdapPropMappings);
    }

    @Override
    public Collection<Header> getCustomRequestHeaders(HttpSession session, HttpServletRequest originalRequest) {

        // Don't use this provider for trusted request
        if (isPreAuthorized(session) || isAnnonymous()) {
            return Collections.emptyList();
        }

        synchronized (session) {
            Optional<Collection<Header>> cached = getCachedHeaders(session);
            return cached.orElseGet(() -> {
                Collection<Header> headers = collectHeaders(session);
                final String username = getCurrentUserName();
                logger.debug("Storing attributes into session for user :" + username);
                session.setAttribute(CACHED_USERNAME_KEY, username);
                session.setAttribute(CACHED_HEADERS_KEY, headers);
                return headers;
            });
        }
    }

    /**
     * Actually performs the building of the request headers list
     */
    private Collection<Header> collectHeaders(HttpSession session) {
        final String username = getCurrentUserName();

        List<Header> headers = buildStandardOrganizationHeaders(username);
        List<Header> userDefinedHeaders = collectHeaderMappings(username, this._headerMapping);

        headers.addAll(userDefinedHeaders);

        return headers;
    }

    private List<Header> buildStandardOrganizationHeaders(String username) {
        // Add user organization
        final String orgCn = loadOrgCn(username);

        List<Header> headers = new ArrayList<>();
        // add sec-orgname
        if (orgCn != null) {
            headers.add(new BasicHeader(SEC_ORG, orgCn));
            try {
                DirContextOperations ctx = this.ldapTemplate.lookupContext("cn=" + orgCn + "," + this.orgSearchBaseDN);
                headers.add(new BasicHeader(SEC_ORGNAME, ctx.getStringAttribute("o")));
            } catch (RuntimeException ex) {
                logger.warn("Cannot find associated org with cn " + orgCn);
            }
        }
        return headers;
    }

    private String loadOrgCn(String username) {
        try {
            // Retreive memberOf attributes
            // WARN! (groldan) looks like _userSearch is a singleton, so we could be mixing
            // up setReturningAttributes from concurrent requests (we're synchronized on
            // session here, not on _userSearch)
            this._userSearch.setReturningAttributes(new String[] { "memberOf" });
            DirContextOperations orgData = _userSearch.searchForUser(username);
            Attribute attributes = orgData.getAttributes().get("memberOf");
            if (attributes != null) {
                NamingEnumeration<?> all = attributes.getAll();
                while (all.hasMore()) {
                    String memberOf = all.next().toString();
                    Matcher m = this.orgSeachMemberOfPattern.matcher(memberOf);
                    if (m.matches()) {
                        String orgCn = m.group(2);
                        return orgCn;
                    }
                }
            }
        } catch (javax.naming.NamingException e) {
            logger.error("problem adding headers for request: organization", e);
        } finally {
            // restore standard attribute list
            this._userSearch.setReturningAttributes(null);
        }
        return null;
    }

    List<Header> collectHeaderMappings(String username, Map<String, String> mappings) {
        final List<Header> headers = new ArrayList<>();
        DirContextOperations userData;
        try {
            userData = _userSearch.searchForUser(username);
        } catch (Exception e) {
            logger.warn("Unable to lookup user:" + username, e);
            return Collections.emptyList();
        }
        try {
            final Attributes ldapUserAttributes = userData.getAttributes();
            mappings.forEach((headerName, ldapPropertyName) -> {
                try {
                    final @Nullable String headerValue = buildValue(ldapUserAttributes, ldapPropertyName);
                    headers.add(new BasicHeader(headerName, headerValue));
                } catch (javax.naming.NamingException e) {
                    logger.error("problem adding headers for request:" + headerName, e);
                }
            });
            return headers;
        } finally {
            try {
                userData.close();
            } catch (NamingException e) {
                logger.warn("error closing ldap context for user :" + username, e);
            }
        }
    }

    private String buildValue(Attributes ldapAttributes, String ldapPropertyName) throws NamingException {
        Attribute attribute = ldapAttributes.get(ldapPropertyName);
        if (attribute != null) {
            NamingEnumeration<?> all = attribute.getAll();
            try {
                return Collections.list(all).stream().filter(Predicates.notNull()).map(Object::toString)
                        .collect(Collectors.joining(","));
            } finally {
                all.close();
            }
        }
        return null;
    }

    private String getCurrentUserName() {
        final Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication.getName();
    }

    private Optional<Collection<Header>> getCachedHeaders(HttpSession session) {
        final String username = getCurrentUserName();

        final boolean cached = session.getAttribute(CACHED_HEADERS_KEY) != null;
        if (cached) {
            try {
                @SuppressWarnings("unchecked")
                Collection<Header> headers = (Collection<Header>) session.getAttribute(CACHED_HEADERS_KEY);
                String expectedUsername = (String) session.getAttribute(CACHED_USERNAME_KEY);

                if (username.equals(expectedUsername)) {
                    return Optional.of(headers);
                }
            } catch (Exception e) {
                logger.info("Unable to lookup cached user's attributes for user :" + username, e);
            }
        }
        return Optional.empty();
    }

    private boolean isAnnonymous() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication instanceof AnonymousAuthenticationToken;
    }
}
