import type { RunStep } from "./run-types";

export const runTitle = "Prepare the Q3 board update";
export const defaultRunSteps: RunStep[] = [
  {id:"revenue", title:"Pull Q3 revenue and churn", detail:"From Stripe, July to September", tool:"stripe.query", calls:[
    {name:"stripe.query",summary:"Revenue by month, Q3",icon:"currency",duration:700,args:{metric:"revenue",from:"2026-07-01",to:"2026-09-30",group_by:"month"},result:{total:4310000,months:[1380000,1420000,1510000],growth:0.21}},
    {name:"stripe.query",summary:"Customer churn, Q3",icon:"currency",duration:500,args:{metric:"churn_rate",period:"quarter"},result:{churn_rate:0.018,previous:0.021}},
  ]},
  {id:"memo", title:"Read last quarter's board memo", detail:"Keeps the structure the board knows", tool:"search", calls:[
    {name:"search",summary:"Drive: “board memo Q2”",icon:"search",duration:900,args:{query:"board memo Q2",source:"drive",limit:5},result:[{title:"Board memo – Q2 2026",owner:"Maya Chen",edited:"Jul 9"}]},
    {name:"docs.read",summary:"Board memo – Q2 2026",icon:"document",duration:700,args:{doc:"Board memo – Q2 2026"},result:"6 sections · 1,240 words"},
  ]},
  {id:"draft", title:"Update the memo draft", detail:"Revenue, churn and the Q4 outlook", tool:"docs.write", calls:[
    {name:"docs.write",summary:"Rewrote the revenue paragraph",icon:"document",duration:1100,args:{doc:"Board memo – Q3 2026",section:"Revenue"},result:{changed_words:21}},
    {name:"docs.write",summary:"Added the churn chart",icon:"document",duration:600,args:{doc:"Board memo – Q3 2026",insert:"chart",data:"churn_rate"},result:{ok:true}},
  ]},
  {id:"send", title:"Send the draft to Maya", detail:"Needs your approval first", tool:"gmail.send", calls:[
    {name:"gmail.send",summary:"Sent to maya@logio.com",icon:"mail",duration:600,args:{to:"maya@logio.com",subject:"Q3 board update – draft",attach:"Board memo – Q3 2026"},result:{id:"msg_8f2c",status:"sent"}},
  ],approval:{title:"Send the draft to Maya",description:"Emails the Q3 board memo draft for review before Friday.",risk:"medium",details:[{label:"To",value:"Maya Chen (CFO)"},{label:"Subject",value:"Q3 board update – draft"},{label:"Attachment",value:"Board memo – Q3 2026"}]}},
  {id:"review", title:"Book a review with Maya", detail:"30 minutes before the board meeting", tool:"calendar.create", calls:[
    {name:"calendar.create",summary:"Thu, Oct 15 · 10:00",icon:"calendar",duration:700,args:{title:"Q3 board memo review",with:["maya@logio.com"],duration:30},result:{event:"evt_31a",time:"2026-10-15T10:00"}},
  ]},
];
