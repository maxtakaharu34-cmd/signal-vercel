import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dialog=file=>readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8').match(/<dialog class="about-dialog"[\s\S]*?<\/dialog>/)[0];
test('viewer about dialog keeps simulation notices and omits admin-only sections',()=>{
 const viewer=dialog('index.html');
 for(const text of ['表示価格と残高はサイト内で生成されます','実際の市場価格とは連動しない','市場予測や投資助言ではありません','認可・登録番号','TradingView'])assert.ok(viewer.includes(text),text);
 for(const text of ['管理者による変更','保存と書き出し','入口コード'])assert.ok(!viewer.includes(text),text);
});
test('admin about dialog has every section',()=>{
 const admin=dialog('admin/index.html');
 for(const text of ['管理者による変更','保存と書き出し','入口コード','実際の市場価格とは連動しない','認可・登録番号'])assert.ok(admin.includes(text),text);
});
