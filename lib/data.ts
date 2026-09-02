export type Menu={id:string;name:string;category:string;price:number;cost:number;stock:number;active:boolean;emoji:string};
export type Order={id:string;table:string;customer:string;status:"NEW"|"CONFIRMED"|"COOKING"|"READY"|"SERVED"|"PAID"|"CANCELLED";total:number;items:string[];time:string;channel:"POS"|"QR"|"WA"};
export const menus:Menu[]=[
{id:"m1",name:"Beef Tenderloin",category:"Main Course",price:185000,cost:85000,stock:18,active:true,emoji:"🥩"},
{id:"m2",name:"Truffle Pasta",category:"Main Course",price:125000,cost:55000,stock:24,active:true,emoji:"🍝"},
{id:"m3",name:"Salmon Miso",category:"Main Course",price:165000,cost:70000,stock:12,active:true,emoji:"🍣"},
{id:"m4",name:"Garden Salad",category:"Starter",price:65000,cost:25000,stock:30,active:true,emoji:"🥗"},
{id:"m5",name:"Mushroom Soup",category:"Starter",price:55000,cost:18000,stock:25,active:true,emoji:"🍲"},
{id:"m6",name:"Signature Mocktail",category:"Beverage",price:48000,cost:12000,stock:40,active:true,emoji:"🍹"},
{id:"m7",name:"Espresso Martini",category:"Beverage",price:85000,cost:25000,stock:16,active:true,emoji:"🍸"},
{id:"m8",name:"Tiramisu",category:"Dessert",price:58000,cost:20000,stock:20,active:true,emoji:"🍰"},
{id:"m9",name:"Cheesecake",category:"Dessert",price:52000,cost:18000,stock:14,active:true,emoji:"🍮"}];
export const initialOrders:Order[]=[
{id:"ORD-2401",table:"T-07",customer:"Budi Santoso",status:"COOKING",total:463000,items:["Beef Tenderloin x2","Signature Mocktail x1"],time:"19:42",channel:"QR"},
{id:"ORD-2402",table:"T-03",customer:"Sari",status:"READY",total:248000,items:["Truffle Pasta x1","Tiramisu x1","Espresso Martini x1"],time:"19:39",channel:"POS"},
{id:"ORD-2403",table:"T-12",customer:"Andi",status:"NEW",total:185000,items:["Salmon Miso x1"],time:"19:45",channel:"WA"},
{id:"ORD-2404",table:"T-02",customer:"Rina",status:"PAID",total:420000,items:["Beef Tenderloin x1","Garden Salad x1","Mocktail x2"],time:"19:21",channel:"POS"}];
export const tables=Array.from({length:20},(_,i)=>({id:`T-${String(i+1).padStart(2,"0")}`,status:i<3?"OCCUPIED":i===3?"RESERVED":"AVAILABLE",seats:[2,2,4,4,6][i%5]}));
export const rupiah=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
export const nowTime=()=>new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});