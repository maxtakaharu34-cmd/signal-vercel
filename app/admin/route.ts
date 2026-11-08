import {PAGES} from "../../server/pages.generated.mjs";
export function GET(){return new Response(PAGES["/admin/"],{headers:{"content-type":"text/html;charset=utf-8","cache-control":"private, no-store"}})}
