#!/usr/bin/env node
import {randomBytes, scrypt as scryptCallback} from "node:crypto";
import {promisify} from "node:util";
import {createInterface} from "node:readline";

const scrypt=promisify(scryptCallback);
const N=16384, r=8, p=1, keyLength=32, maxmem=96*1024*1024;

async function readPassword(){
  const arg=process.argv.slice(2).find(a=>!a.startsWith("--"));
  if(arg) return arg;
  if(process.stdin.isTTY) process.stderr.write("Password License Center (minimal 8 karakter): ");
  const rl=createInterface({input:process.stdin});
  for await(const line of rl){rl.close();return line;}
  return "";
}

async function hashPassword(password){
  const salt=randomBytes(16);
  const key=await scrypt(password.normalize("NFKC"),salt,keyLength,{N,r,p,maxmem});
  return ["scrypt",N,r,p,salt.toString("base64"),Buffer.from(key).toString("base64")].join("$");
}

const password=String(await readPassword()).trim();
if(password.length<8){console.error("Password minimal 8 karakter.");process.exit(1);}
const hash=await hashPassword(password);
const authSecret=randomBytes(48).toString("base64url");
console.log("\nTambahkan ke Vercel Environment Variables:\n");
console.log(`LICENSE_CENTER_PASSWORD_HASH=${hash}`);
console.log(`LICENSE_CENTER_AUTH_SECRET=${authSecret}`);
console.log("\nLICENSE_SIGNING_SECRET tetap gunakan nilai yang sudah dipakai untuk lisensi KSP1.");
console.log("Jangan commit nilai rahasia ini ke Git.\n");
