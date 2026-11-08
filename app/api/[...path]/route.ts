import {handleVercelApi} from "../../../server/vercel-api.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
export const GET=(request:Request)=>handleVercelApi(request,process.env);
export const POST=GET;
