# Deployment notes

`PAYLOAD_TRUSTED_PROXY_HEADER` is unset by default, meaning no request header is trusted for client identity. Set it only to the exact header your trusted ingress overwrites. Forwarding headers such as `x-forwarded-for` are ignored unless explicitly configured.
