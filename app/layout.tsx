import type { Metadata } from "next";
export const metadata: Metadata = {title:"FX SIM Dashboard",description:"生成価格で動く取引画面。実際の売買や資金移動はありません。"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
