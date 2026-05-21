python - << 'PY'
import secrets
for pid in ["creality_k1se", "wanhao_i3", "creality_ender3"]:
    print(f"{pid}:{'devtok_' + secrets.token_urlsafe(32)}")
PY