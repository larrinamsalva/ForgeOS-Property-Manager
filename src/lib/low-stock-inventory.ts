import type {InventoryItem,OperationsSnapshot} from './operations-domain';

type StockRecord=OperationsSnapshot['summary']['stock'][number];
export type LowStockItem={
 item:InventoryItem;
 availableMilli:string;
 suggestedMilli:string;
 outOfStock:boolean;
};

/** Read-only current supply shortages, based on the SAME inclusive reorder
 * threshold as the Inventory stock list. No auto-purchasing, assignments,
 * or changes to the retained stock movement ledger. */
export function lowStockInventory(
 items:readonly InventoryItem[],
 stock:readonly StockRecord[],
 authorizedPropertyIds:readonly string[],
):LowStockItem[]{
 const allowed=new Set(authorizedPropertyIds);
 const balances=new Map(stock.map(row=>[row.id,row.quantity_milli]));
 return items.filter(item=>allowed.has(item.property_id)&&!item.archived)
  .flatMap(item=>{
   const available=BigInt(balances.get(item.id)??'0');
   if(available>BigInt(item.reorder_milli))return [];
   const target=BigInt(item.restock_milli);
   return [{
    item,
    availableMilli:available.toString(),
    suggestedMilli:(target>available?target-available:0n).toString(),
    outOfStock:available<=0n,
   }];
  })
  .sort((a,b)=>
   Number(b.outOfStock)-Number(a.outOfStock) ||
   a.item.property_id.localeCompare(b.item.property_id) ||
   a.item.name.localeCompare(b.item.name) ||
   a.item.id.localeCompare(b.item.id)
  );
}

/** Links encode operational IDs only. The actual Inventory page checks
 * property membership and the server-authorized operations API. */
export function lowStockInventoryLink(organizationId:string,propertyId:string):string{
 return '/inventory?'+new URLSearchParams({
  organization:organizationId,property:propertyId,stock:'low',
 });
}
