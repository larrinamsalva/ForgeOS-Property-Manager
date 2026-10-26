import {describe,it,expect} from 'vitest';
import {preventiveReminders} from '../../src/lib/preventive-reminders';
import type {Equipment,OpsPlan} from '../../src/lib/operations-domain';
const equipment=[
 {id:'pump',property_id:'park',name:'Pump',next_service_on:'2026-10-24',archived:false},
 {id:'washer',property_id:'park',name:'Washer',next_service_on:'2026-11-01',archived:false},
 {id:'other',property_id:'elsewhere',name:'Other',next_service_on:'2026-10-24',archived:false},
 {id:'old',property_id:'park',name:'Archived',next_service_on:'2026-10-20',archived:true},
] as Equipment[];
const plans=[
 {id:'weekly',property_id:'park',label:'Weekly grounds check',anchor_on:'2026-10-19',interval_days:7,ends_on:null,active:true},
 {id:'inactive',property_id:'park',label:'Inactive',anchor_on:'2026-10-26',interval_days:1,ends_on:null,active:false},
 {id:'past',property_id:'park',label:'Ended',anchor_on:'2026-10-19',interval_days:7,ends_on:'2026-10-20',active:true},
] as OpsPlan[];
describe('preventive property reminders',()=>{
 it('shows overdue equipment and upcoming scheduled service and recurring plans',()=>{
  expect(preventiveReminders(equipment,plans,'park','2026-10-26','2026-11-02')).toEqual([
   {id:'pump',label:'Pump',date:'2026-10-24',kind:'equipment',state:'overdue'},
   {id:'weekly',label:'Weekly grounds check',date:'2026-10-26',kind:'plan',state:'upcoming'},
   {id:'washer',label:'Washer',date:'2026-11-01',kind:'equipment',state:'upcoming'},
  ]);
 });
 it('excludes archived equipment and unauthorized properties',()=>{
  expect(preventiveReminders(equipment,plans,'elsewhere','2026-10-26','2026-11-02')).toEqual([
   {id:'other',label:'Other',date:'2026-10-24',kind:'equipment',state:'overdue'},
  ]);
 });
});