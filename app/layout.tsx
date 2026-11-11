import type { Metadata } from "next";
export const metadata: Metadata = {title:"FX SIM Dashboard",description:"サイト内で生成した価格と残高を使う模擬取引。入出金はできません。"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
