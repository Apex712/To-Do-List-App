(() => {
  'use strict';
  const STORAGE_KEY = 'daymark.tasks.v1';
  const THEME_KEY = 'daymark.theme.v1';
  const $ = (selector) => document.querySelector(selector);
  const taskList = $('#task-list');
  const completedList = $('#completed-list');
  const form = $('#add-form');
  const input = $('#task-input');
  let tasks = loadTasks();
  let view = 'today';
  let undoState = null;
  let toastTimer;

  function loadTasks() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter(t => t && typeof t.id === 'string' && typeof t.text === 'string')
        .map(t => ({id:t.id,text:t.text.slice(0,120),done:Boolean(t.done),created:Number(t.created)||Date.now(),completed:Number(t.completed)||null}));
    } catch (_) { return []; }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (_) { showToast('Could not save tasks on this device'); } }
  function escapeText(value) { const span=document.createElement('span'); span.textContent=value; return span.innerHTML; }
  function shownTasks() { return view === 'all' ? tasks : tasks.filter(t => !t.done); }
  function makeRow(task) {
    const row=document.createElement('div'); row.className=`task-row${task.done?' done':''}`; row.dataset.id=task.id; row.draggable=!task.done;
    row.innerHTML=`<span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder"><svg viewBox="0 0 12 18"><circle cx="3" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="3" cy="14" r="1"/><circle cx="9" cy="14" r="1"/></svg></span><button class="task-check" aria-label="${task.done?'Mark as incomplete':'Mark as complete'}" aria-pressed="${task.done}"><svg viewBox="0 0 16 16"><path d="m3 8 3.2 3.2L13 4.5"/></svg></button><span class="task-copy">${escapeText(task.text)}</span><span class="task-meta">${task.done?'Done':new Date(task.created).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span><button class="delete-button" aria-label="Delete task"><svg viewBox="0 0 24 24"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`;
    row.querySelector('.task-check').addEventListener('click', () => toggleTask(task.id));
    row.querySelector('.delete-button').addEventListener('click', () => deleteTask(task.id));
    if (!task.done) addDragHandlers(row);
    return row;
  }
  function render() {
    taskList.replaceChildren(); completedList.replaceChildren();
    const active=shownTasks().filter(t=>!t.done), completed=tasks.filter(t=>t.done);
    active.forEach(t=>taskList.append(makeRow(t)));
    completed.forEach(t=>completedList.append(makeRow(t)));
    const isToday=view==='today', isAll=view==='all';
    $('#crumb-label').textContent=isToday?'Today':isAll?'All tasks':'Upcoming';
    $('#page-title').innerHTML=`${isToday?'Today':isAll?'All tasks':'Upcoming'}<span class="title-period">.</span>`;
    $('#list-heading').textContent=isToday?'Your tasks':isAll?'All tasks':'Upcoming';
    $('#list-caption').textContent=isToday?'IN THE ORDER YOU CHOOSE':isAll?'EVERY TASK, IN ONE PLACE':'YOUR OPEN TASKS';
    $('#subtitle').textContent=isToday?'A clear mind starts with a clear list.':isAll?'Everything you have on your list.':'The next steps, all in one place.';
    $('#today-count').textContent=tasks.filter(t=>!t.done).length;
    $('#remaining-count').textContent=tasks.filter(t=>!t.done).length;
    $('#completed-count').textContent=completed.length;
    $('#completed-badge').textContent=completed.length;
    $('#completed-section').style.display=completed.length?'':'none';
    $('#empty-state').classList.toggle('visible',active.length===0);
    $('#empty-title').textContent=tasks.length===0?'A fresh start':'All caught up';
    $('#empty-copy').textContent=tasks.length===0?'Add a task above and make today count.':'You’ve cleared your list. Enjoy the breathing room.';
    const ratio=tasks.length?completed.length/tasks.length:0;
    $('#progress-value').textContent=`${Math.round(ratio*100)}%`;
    $('#progress-ring').setAttribute('aria-label',`${Math.round(ratio*100)} percent complete`);
    $('.ring-value').style.strokeDashoffset=String(151-(151*ratio));
  }
  function addTask(text) {
    const clean=text.trim(); if(!clean)return;
    tasks.unshift({id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`,text:clean.slice(0,120),done:false,created:Date.now(),completed:null});
    save();render();input.value='';input.focus();
  }
  function toggleTask(id) {
    const task=tasks.find(t=>t.id===id);if(!task)return;
    if(!task.done){undoState={type:'toggle',id,previous:false};task.done=true;task.completed=Date.now();showToast('Nice work — task completed',true);}
    else{task.done=false;task.completed=null;undoState=null;hideToast();}
    save();render();
  }
  function deleteTask(id) { const idx=tasks.findIndex(t=>t.id===id);if(idx<0)return;const [removed]=tasks.splice(idx,1);undoState={type:'delete',task:removed,index:idx};save();render();showToast('Task deleted',true); }
  function undo() {
    if(!undoState)return;
    if(undoState.type==='toggle'){const t=tasks.find(t=>t.id===undoState.id);if(t){t.done=false;t.completed=null;}}
    if(undoState.type==='delete')tasks.splice(Math.min(undoState.index,tasks.length),0,undoState.task);
    undoState=null;save();render();hideToast();
  }
  function showToast(message,withUndo=false){$('#toast-message').textContent=message;$('#undo-button').style.display=withUndo?'':'none';$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{hideToast();undoState=null;},4500);}
  function hideToast(){ $('#toast').classList.remove('visible');clearTimeout(toastTimer); }
  let draggedId=null;
  function addDragHandlers(row){
    row.addEventListener('dragstart',e=>{draggedId=row.dataset.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedId);requestAnimationFrame(()=>row.classList.add('dragging'));});
    row.addEventListener('dragend',()=>{draggedId=null;document.querySelectorAll('.drag-over,.dragging').forEach(x=>x.classList.remove('drag-over','dragging'));});
    row.addEventListener('dragover',e=>{if(!draggedId||draggedId===row.dataset.id)return;e.preventDefault();row.classList.add('drag-over');});
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drag-over');const from=tasks.findIndex(t=>t.id===draggedId),to=tasks.findIndex(t=>t.id===row.dataset.id);if(from<0||to<0||from===to)return;const [item]=tasks.splice(from,1);tasks.splice(to,0,item);save();render();});
  }
  form.addEventListener('submit',e=>{e.preventDefault();addTask(input.value);});
  $('#undo-button').addEventListener('click',undo);
  $('#completed-toggle').addEventListener('click',()=>{const button=$('#completed-toggle'),expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));completedList.classList.toggle('collapsed',expanded);});
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));button.classList.add('active');view=button.dataset.view;render();}));
  $('#theme-button').addEventListener('click',()=>{document.body.classList.toggle('light');try{localStorage.setItem(THEME_KEY,document.body.classList.contains('light')?'light':'dark');}catch(_){}});
  $('#sort-button').addEventListener('click',()=>{const active=tasks.filter(t=>!t.done),done=tasks.filter(t=>t.done);const sorted=[...active].sort((a,b)=>a.created-b.created);const isOldestFirst=active.every((t,i)=>t.id===sorted[i]?.id);active.sort((a,b)=>isOldestFirst?b.created-a.created:a.created-b.created);tasks=[...active,...done];save();render();$('#sort-button span').textContent=isOldestFirst?'Oldest first':'Newest first';});
  try{if(localStorage.getItem(THEME_KEY)==='light')document.body.classList.add('light');}catch(_){}
  $('#date-label').textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date());
  render();
})();
