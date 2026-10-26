export const propertyChecklistTemplates = [
 {id:'bathrooms',label:'Bathrooms & showers',category:'cleaning',items:['Clean and disinfect toilets and stalls','Clean sinks and counters','Clean showers and drains','Clean mirrors and glass','Sweep and mop floors','Refill toilet paper, soap and paper towels','Check plumbing for leaks or blockages']},
 {id:'laundry',label:'Laundry rooms',category:'cleaning',items:['Wipe and disinfect machine exteriors','Check and clear accessible lint traps safely','Clean folding tables and counters','Sweep and mop floor','Empty trash and replace liners','Report damaged or leaking machines']},
 {id:'trash',label:'Trash & dumpsters',category:'grounds',items:['Empty trash cans and install fresh liners','Pick up litter around bins','Check dumpster capacity and access','Clean spills around waste area safely','Report pest activity or unsafe waste']},
 {id:'landscaping',label:'Landscaping & walkways',category:'grounds',items:['Collect branches and debris','Inspect walkways for trip hazards','Check irrigation and sprinklers for leaks','Check trees for damaged or hanging branches','Inspect planted areas and weeds','Report hazards requiring licensed or specialized service']},
 {id:'rv-sites',label:'RV sites & hookups',category:'site-inspection',items:['Remove loose litter and debris','Visually inspect water hookup for leaks','Visually inspect electrical pedestal for damage without opening it','Inspect sewer connection area for leaks or odors','Check pad and access for trip hazards','Report damaged hookups for qualified repair']},
 {id:'common',label:'Common areas & entrances',category:'cleaning',items:['Wipe tables and touch surfaces','Clean windows and doors','Sweep entrances and shared walkways','Empty trash and replace liners','Inspect lighting and report outages','Check shared facilities for damage or hazards']},
] as const;
export function propertyChecklistTemplate(id:string) {
 return propertyChecklistTemplates.find(t=>t.id===id);
}
