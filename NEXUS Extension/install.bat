@REM npm cache clean --force

@REM npm config rm proxy

@REM npm config rm https-proxy

set http_proxy=http://172.17.0.11:8080

set https_proxy=http://172.17.0.11:8080

npm install -g @vscode/vsce

PAUSE