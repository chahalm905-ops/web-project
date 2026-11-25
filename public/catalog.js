export const topics = {
  orchestration: ['Orchestration','⌘'],
  evaluation: ['Evaluation','◫'],
  tooling: ['Tool use','⚒'],
  memory: ['Memory','◈'],
  multimodal: ['Multimodal','✦'],
  other: ['Other','◇'],
};
export const kinds = {problem:'Problem', project:'Project', idea:'Idea'};
export const examples = [
  {id:'example-handoff',kind:'problem',topic:'orchestration',title:'How do you keep context across agent handoffs?',body:'My research agent collects source notes, then a writing agent drafts a summary. When I pass over the entire conversation, the writer misses the latest decisions. A one-paragraph summary loses the source links. I’m looking for a small handoff format that preserves decisions, citations, and open questions.',author:'Example post',createdAt:0},
  {id:'example-evals',kind:'project',topic:'evaluation',title:'Build a tiny evaluation kit for tool-using agents',body:'The idea is to build a small TypeScript library with five fixtures that check whether an agent picked the right tool and supplied the right arguments. The first version could work with local JSON traces. Interested in writing fixtures, designing the output format, or trying it on an agent you’ve built?',author:'Example post',createdAt:0},
  {id:'example-confirmation',kind:'idea',topic:'tooling',title:'Let an agent preview a change before it acts',body:'A file-organizer agent could show the exact rename and move operations it plans to make, then wait for approval. What would make that preview easy to check? I’m thinking about a file tree diff and a one-click way to skip individual changes.',author:'Example post',createdAt:0},
];
for (const example of examples) Object.assign(example,{example:true,status:'open',canEdit:false,replyCount:0});
