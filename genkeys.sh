#!/bin/sh

FQDN=gengdan.edu.cn

SSL_CONFIG="
[ req ]
default_bits = 1024
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[ dn ]
C = CN
ST = Beijing
O = GengdanHealth Dev
CN = ${FQDN}

[ req_ext ]
subjectAltName = DNS:${FQDN}
"

openssl genrsa -out key_private.pem 1024
echo "${SSL_CONFIG}" |openssl req -new -key key_private.pem -config - -out csr.pem
openssl x509 -req -in csr.pem -signkey key_private.pem -out key_public.pem
