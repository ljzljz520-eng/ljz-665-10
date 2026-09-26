#!/usr/bin/env bash
# 增删改查 + 权限分离 演示脚本（需先启动服务：npm start）
BASE="${BASE:-http://localhost:3000}"
PASS=0; FAIL=0

check() { # check <描述> <期望> <实际>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1";
  else FAIL=$((FAIL+1)); echo "  ❌ $1（期望 $2，实际 $3）"; fi
}

echo "=== 1. 登录三种角色 ==="
TOKEN_ADMIN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')
TOKEN_EDITOR=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"editor","password":"edit123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')
TOKEN_VIEWER=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"viewer","password":"view123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')
[ -n "$TOKEN_ADMIN" ] && [ -n "$TOKEN_EDITOR" ] && [ -n "$TOKEN_VIEWER" ] && echo "  ✅ 三个角色登录成功" || echo "  ❌ 登录失败"

echo "=== 2. 查看员（viewer）权限边界 ==="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/equipment" -H "Authorization: Bearer $TOKEN_VIEWER")
check "viewer 可查看列表" "200" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/equipment" -H "Authorization: Bearer $TOKEN_VIEWER" -H 'Content-Type: application/json' -d '{"category":"camera","code":"X-1","name":"测试","location":"A区","owner":"张三"}')
check "viewer 新增被拒(403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/equipment/G0001" -H "Authorization: Bearer $TOKEN_VIEWER")
check "viewer 删除被拒(403)" "403" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users" -H "Authorization: Bearer $TOKEN_VIEWER")
check "viewer 访问用户管理被拒(403)" "403" "$CODE"

echo "=== 3. 器材管理员（editor）增改查 ==="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/equipment/G0001" -H "Authorization: Bearer $TOKEN_EDITOR")
check "editor 删除被拒(403)" "403" "$CODE"
NEW_ID=$(curl -s -X POST "$BASE/api/equipment" -H "Authorization: Bearer $TOKEN_EDITOR" -H 'Content-Type: application/json' \
  -d '{"category":"light","code":"LGT-DEMO-01","name":"演示用补光灯","brand":"Demo","model":"DL-100","location":"B 区灯架区","status":"in_stock","owner":"李器材","remark":"演示脚本创建"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
check "editor 新增成功" "G" "${NEW_ID:0:1}"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/equipment/$NEW_ID" -H "Authorization: Bearer $TOKEN_EDITOR" -H 'Content-Type: application/json' \
  -d '{"category":"light","code":"LGT-DEMO-01","name":"演示用补光灯（已修改）","brand":"Demo","model":"DL-100","location":"B 区灯架区","status":"borrowed","owner":"李器材"}')
check "editor 修改成功" "200" "$CODE"
ATT=$(printf '演示附件内容' | base64)
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/equipment/$NEW_ID/attachments" -H "Authorization: Bearer $TOKEN_EDITOR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"演示附件.txt\",\"mime\":\"text/plain\",\"dataBase64\":\"$ATT\"}")
check "editor 上传附件" "200" "$CODE"

echo "=== 4. 管理员（admin）删除 + 用户管理 ==="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/equipment/$NEW_ID" -H "Authorization: Bearer $TOKEN_ADMIN")
check "admin 删除成功" "200" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users" -H "Authorization: Bearer $TOKEN_ADMIN")
check "admin 可访问用户管理" "200" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/users" -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' \
  -d '{"username":"demo_user","realName":"演示用户","password":"demo123","role":"viewer"}')
check "admin 新建用户" "200" "$CODE"
DEMO_UID=$(curl -s "$BASE/api/users" -H "Authorization: Bearer $TOKEN_ADMIN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.find(u=>u.username==="demo_user").id')
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/users/$DEMO_UID" -H "Authorization: Bearer $TOKEN_ADMIN")
check "admin 删除用户" "200" "$CODE"

echo "=== 5. 未登录访问 ==="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/equipment")
check "未登录访问被拒(401)" "401" "$CODE"

echo ""
echo "结果：通过 $PASS 项，失败 $FAIL 项"
[ "$FAIL" -eq 0 ]
