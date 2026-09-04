import type {Metadata} from "next";
import {notFound} from "next/navigation";
import CustomerOrdering from "@/components/CustomerOrdering";
import {STORE_NAME} from "@/lib/data";

type Params = {storeId: string; tableId: string};

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

function clean(value: string) {
  return decodeURIComponent(value || "").trim().toLowerCase();
}

export async function generateMetadata({params}: {params: Promise<Params>}): Promise<Metadata> {
  const {tableId} = await params;
  const table = clean(tableId);
  return {
    title: `${STORE_NAME} • Meja ${SLUG.test(table) ? table : "-"}`,
    description: "Digital menu dan QR ordering",
    robots: {index: false, follow: false}
  };
}

export default async function Page({params}: {params: Promise<Params>}) {
  const {storeId, tableId} = await params;
  const store = clean(storeId);
  const table = clean(tableId);

  // Segmen URL berasal dari QR yang bisa diedit siapa pun, jadi divalidasi sebelum dipakai.
  if (!SLUG.test(store) || !SLUG.test(table)) notFound();

  return <CustomerOrdering storeId={store} tableId={table} />;
}
