---
name: oracle
description: ユーザーが「OracleDBに接続」「SQLを実行」「データベースを確認」「テーブル一覧」「データを取得」などと指示した時に使用。Python oracledbを使用したOracle Database操作スキル
---

# Oracle Database 操作

Python `oracledb` パッケージを使用して、Oracle Databaseへの接続・クエリ実行・データ操作を行います。

## 前提条件

- Oracle Database への接続情報を保持していること
- Python パッケージ: `oracledb`
- `~/.claude/env.yaml` に接続情報を設定：

```yaml
oracle_host: your-oracle-host.example.com
oracle_port: 1521
oracle_service: ORCL
oracle_user: YOUR_USERNAME
oracle_password: YOUR_PASSWORD
```

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install oracledb
```

**注意**: `oracledb` はThinモード（Oracle Clientインストール不要）で動作するため、追加のインストールは不要です。

## トリガーとなるフレーズ

- "OracleDBに接続して" / "データベース確認"
- "テーブル一覧を表示"
- "SQLを実行して"
- "データを取得して"
- "レコードを挿入して"
- "データを更新して"

## 操作一覧

### 1. 接続テスト

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/oracle/oracle_query.py --test
```

`oracle_query.py` のスケルトン:

```python
import os
import sys
import json
import oracledb

def get_connection():
    """環境変数から接続情報を取得してコネクションを返す"""
    host = os.environ.get('ORACLE_HOST', 'localhost')
    port = int(os.environ.get('ORACLE_PORT', '1521'))
    service = os.environ.get('ORACLE_SERVICE', 'ORCL')
    user = os.environ.get('ORACLE_USER', '')
    password = os.environ.get('ORACLE_PASSWORD', '')

    dsn = oracledb.makedsn(host, port, service_name=service)
    conn = oracledb.connect(user=user, password=password, dsn=dsn)
    return conn

def test_connection():
    """接続テスト"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 'OK' FROM DUAL")
    result = cursor.fetchone()
    print(f"接続成功: {result[0]}")
    cursor.close()
    conn.close()

def execute_query(sql, params=None):
    """SELECT文を実行して結果を返す"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql, params or {})
    columns = [col[0] for col in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return columns, rows

def execute_dml(sql, params=None):
    """INSERT/UPDATE/DELETE文を実行"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql, params or {})
    rowcount = cursor.rowcount
    conn.commit()
    cursor.close()
    conn.close()
    return rowcount

if __name__ == '__main__':
    if '--test' in sys.argv:
        test_connection()
    elif len(sys.argv) > 1:
        sql = sys.argv[1]
        columns, rows = execute_query(sql)
        print('\t'.join(columns))
        for row in rows:
            print('\t'.join(str(v) for v in row))
```

### 2. SELECT クエリの実行

```bash
source ~/.claude/lib/load_env.sh

# テーブル一覧
run_python ~/.claude/skills/oracle/oracle_query.py "SELECT table_name FROM user_tables ORDER BY table_name"

# データ取得
run_python ~/.claude/skills/oracle/oracle_query.py "SELECT * FROM employees WHERE department_id = 10"

# 件数確認
run_python ~/.claude/skills/oracle/oracle_query.py "SELECT COUNT(*) FROM employees"
```

### 3. インラインPythonでの実行

簡単なクエリはインラインPythonでも実行可能です。

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import oracledb, os
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
cursor.execute('SELECT table_name FROM user_tables ORDER BY table_name')
for row in cursor:
    print(row[0])
cursor.close()
conn.close()
"
```

### 4. テーブル構造の確認

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/oracle/oracle_query.py "SELECT column_name, data_type, data_length, nullable FROM user_tab_columns WHERE table_name = 'EMPLOYEES' ORDER BY column_id"
```

### 5. INSERT（データ挿入）

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import oracledb, os
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
cursor.execute(
    'INSERT INTO employees (employee_id, first_name, last_name, email) VALUES (:1, :2, :3, :4)',
    [1001, 'Taro', 'Yamada', 'taro@example.com']
)
conn.commit()
print(f'{cursor.rowcount}行を挿入しました')
cursor.close()
conn.close()
"
```

### 6. UPDATE（データ更新）

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import oracledb, os
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
cursor.execute(
    'UPDATE employees SET email = :1 WHERE employee_id = :2',
    ['new_email@example.com', 1001]
)
conn.commit()
print(f'{cursor.rowcount}行を更新しました')
cursor.close()
conn.close()
"
```

### 7. DELETE（データ削除）

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import oracledb, os
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
cursor.execute('DELETE FROM employees WHERE employee_id = :1', [1001])
conn.commit()
print(f'{cursor.rowcount}行を削除しました')
cursor.close()
conn.close()
"
```

### 8. 結果をCSV/JSONで出力

```bash
source ~/.claude/lib/load_env.sh

# CSV出力
run_python -c "
import oracledb, os, csv, sys
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
cursor.execute('SELECT * FROM employees')
columns = [col[0] for col in cursor.description]
writer = csv.writer(open('./outputs/query_result.csv', 'w', newline=''))
writer.writerow(columns)
writer.writerows(cursor)
print('CSVファイルを ./outputs/query_result.csv に出力しました')
cursor.close()
conn.close()
"

# JSON出力
run_python -c "
import oracledb, os, json
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
cursor.execute('SELECT * FROM employees')
columns = [col[0] for col in cursor.description]
rows = [dict(zip(columns, row)) for row in cursor]
with open('./outputs/query_result.json', 'w') as f:
    json.dump(rows, f, indent=2, default=str)
print('JSONファイルを ./outputs/query_result.json に出力しました')
cursor.close()
conn.close()
"
```

### 9. PL/SQL ストアドプロシージャの実行

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import oracledb, os
conn = oracledb.connect(
    user=os.environ.get('ORACLE_USER'),
    password=os.environ.get('ORACLE_PASSWORD'),
    dsn=oracledb.makedsn(
        os.environ.get('ORACLE_HOST', 'localhost'),
        int(os.environ.get('ORACLE_PORT', '1521')),
        service_name=os.environ.get('ORACLE_SERVICE', 'ORCL')
    )
)
cursor = conn.cursor()
# プロシージャ呼び出し
result = cursor.var(oracledb.STRING)
cursor.callproc('my_procedure', [param1, param2, result])
print(f'結果: {result.getvalue()}')
conn.commit()
cursor.close()
conn.close()
"
```

## env.yaml 設定例

```yaml
# Oracle Database設定
oracle_host: your-oracle-host.example.com
oracle_port: 1521
oracle_service: ORCL
oracle_user: YOUR_USERNAME
oracle_password: YOUR_PASSWORD
```

## 使用例

### ケース1: テーブル一覧確認
```
ユーザー: "OracleDBのテーブル一覧を見せて"
Claude: SELECT table_name FROM user_tables を実行
```

### ケース2: データ取得
```
ユーザー: "社員テーブルから営業部のデータを取得して"
Claude: SELECT * FROM employees WHERE department = '営業' を実行
```

### ケース3: CSV出力
```
ユーザー: "売上データをCSVで出力して"
Claude: クエリ実行 → ./outputs/query_result.csv に出力
```

## 注意事項

- UPDATE/DELETE実行前にユーザーに確認を取ること
- 大量データのSELECTでは `FETCH FIRST N ROWS ONLY` や `ROWNUM` で件数を制限すること
- INSERT/UPDATE/DELETEは自動COMMITされるため、意図しない更新に注意
- パスワードは `env.yaml` に記載（gitignoreで除外されている）
- 本番環境への接続は特に慎重に行うこと
- oracledb の Thin モード（デフォルト）は Oracle Client のインストールが不要
- CLOBやBLOBなどのLOBデータは特別な処理が必要な場合がある
