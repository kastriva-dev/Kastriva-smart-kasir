export type MenuItem={id:string;name:string;price:number;category:string;description?:string};
export const menu:MenuItem[]=[
{id:"nasi-goreng",name:"Nasi Goreng Spesial",price:25000,category:"Makanan",description:"Nasi goreng dengan telur dan ayam."},
{id:"mie-goreng",name:"Mie Goreng",price:22000,category:"Makanan",description:"Mie goreng gurih dengan sayuran."},
{id:"ayam-geprek",name:"Ayam Geprek",price:28000,category:"Makanan",description:"Ayam crispy dengan sambal pilihan."},
{id:"es-teh",name:"Es Teh",price:7000,category:"Minuman",description:"Teh manis dingin."},
{id:"kopi-susu",name:"Kopi Susu",price:18000,category:"Minuman",description:"Kopi susu creamy."},
{id:"air-mineral",name:"Air Mineral",price:5000,category:"Minuman",description:"Air mineral botol."}
];
export const rupiah=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);