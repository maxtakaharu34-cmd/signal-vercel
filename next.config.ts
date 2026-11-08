import type {NextConfig} from 'next';
const config:NextConfig={
 poweredByHeader:false,
 distDir:process.env.NODE_ENV==='development'?'.next-dev':'.next',
 async headers(){return [{source:'/(.*)',headers:[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'X-Frame-Options',value:process.env.NODE_ENV==='development'?'SAMEORIGIN':'DENY'},
  {key:'Content-Security-Policy',value:`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors '${process.env.NODE_ENV==='development'?'self':'none'}'; base-uri 'self'; form-action 'self'; object-src 'none'`}
 ]}]}
};export default config;
