# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores the Miniflux address and API key in the configuration
of Gladys (the key is a `secret` field, never sent back to the browser) and,
under `/data/miniflux-state.json`, only the ids it needs for its triggers (user
id, last entry id seen, feed ids). It never logs the API key, the feed URLs or
the entries. It talks to the Miniflux address you enter, and to nothing else.
The API key gives full access to the Miniflux account: create a dedicated one
for Gladys, so it can be revoked alone.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Miniflux itself (see its
[security policy](https://github.com/miniflux/v2/security/policy)).
