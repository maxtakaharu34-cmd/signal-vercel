import type { Metadata } from "next";
export const metadata: Metadata = {title:"FX SIM Dashboard",description:"サイト内で生成した価格と残高を表示します。"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
