(function(){
'use strict';

/* ClipTrack front end, connected to the Laravel API (see routes/web.php).
   Data lives in MySQL. This file only shows it and sends changes through the api helper (api.js). */

var $=function(s,el){return (el||document).querySelector(s);};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};

var pad=function(n){return String(n).padStart(2,'0');};
var iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
var todayISO=function(){return iso(new Date());};
var parseD=function(s){var p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);};
var addDays=function(s,n){var d=parseD(s);d.setDate(d.getDate()+n);return iso(d);};
var toMin=function(t){var p=t.split(':').map(Number);return p[0]*60+p[1];};
var fromMin=function(m){return pad(Math.floor(m/60))+':'+pad(m%60);};
var fmtTime=function(t){var p=t.split(':').map(Number);var h=p[0],ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+pad(p[1])+' '+ap;};
var fmtDate=function(s){return parseD(s).toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'});};
var peso=function(n){return '\u20B1'+Number(n).toLocaleString('en-PH');};
var nowMin=function(){var n=new Date();return n.getHours()*60+n.getMinutes();};
var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function normPhone(v){
  var d=String(v||'').replace(/[^\d+]/g,'');
  if(d.indexOf('+63')===0)d='0'+d.slice(3);
  else if(d.indexOf('63')===0&&d.length===12)d='0'+d.slice(2);
  return d;
}
var validPhone=function(v){return /^09\d{9}$/.test(normPhone(v));};

/* ---------- Data (loaded from the server) ---------- */
var db={services:[],staff:[],clients:[],appointments:[],audit:[]};
var session=null;
var ui={mode:'landing',view:'dashboard',done:null};
var filt={q:'',date:'',status:'',staff:''};
var cq={q:''};
var sched={date:todayISO()};

// All ids are kept as text so they compare cleanly with form values.
var normService=function(s){return {id:String(s.id),name:s.name,price:Number(s.price),duration:Number(s.duration),active:s.active!==false};};
var normStaff=function(s){return {id:String(s.id),name:s.name,start:s.start,end:s.end,days:(s.days||[]).map(Number),services:(s.services||[]).map(String)};};
var normApt=function(a){return {id:Number(a.id),clientId:String(a.clientId),serviceId:String(a.serviceId),staffId:String(a.staffId),date:a.date,time:a.time,status:a.status,source:a.source,clientName:a.clientName||'',contact:a.contact||'',serviceName:a.serviceName||'',price:Number(a.price||0),duration:Number(a.duration||30),staffName:a.staffName||''};};
var normClient=function(c){return {id:String(c.id),name:c.name,contact:c.contact||'',visits:Number(c.visits||0),lastVisit:c.lastVisit||'',fav:c.favorites||[]};};

var svc=function(id){return db.services.find(function(s){return s.id===String(id);})||{id:String(id),name:'(removed)',price:0,duration:30,active:false};};
var stf=function(id){return db.staff.find(function(s){return s.id===String(id);})||{name:'(unknown)',days:[],services:[]};};
var apt=function(id){return db.appointments.find(function(a){return a.id===Number(id);});};
var activeServices=function(){return db.services.filter(function(s){return s.active;});};

function loadPublic(){
  return Promise.all([api.get('/services'),api.get('/staff')]).then(function(r){
    db.services=r[0].map(normService);
    db.staff=r[1].map(normStaff);
  });
}
function loadStaffData(){
  var jobs=[api.get('/appointments'),api.get('/clients')];
  if(session.role==='admin')jobs.push(api.get('/audit'));
  return Promise.all(jobs).then(function(r){
    db.appointments=r[0].map(normApt);
    db.clients=r[1].map(normClient);
    db.audit=r[2]||[];
  });
}
function refresh(){
  return loadPublic().then(function(){return session?loadStaffData():null;}).then(function(){render();});
}

// Runs an action and shows a friendly message if the server says no.
function run(fn){
  return Promise.resolve().then(fn).catch(function(e){
    if(e&&e.status===401&&session){session=null;ui.mode='login';render();toast('Your session ended. Please log in again.');return;}
    toast((e&&e.message)||'Something went wrong.');
  });
}
function toast(msg){
  var t=$('#toast');t.textContent=msg;t.classList.add('on');
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('on');},3000);
}

/* ---------- Open time slots (calculated by the server) ---------- */
function fetchSlots(p){
  if(!p.serviceId||!p.date)return Promise.resolve([]);
  var q='/slots?serviceId='+encodeURIComponent(p.serviceId)+'&date='+encodeURIComponent(p.date)+'&staffId='+encodeURIComponent(p.staffId||'any');
  if(p.allowPast)q+='&allowPast=1';
  if(p.ignoreId)q+='&ignoreId='+encodeURIComponent(p.ignoreId);
  return api.get(q);
}
function renderSlots(el,params,selected,onPick){
  el._tok=(el._tok||0)+1;var tok=el._tok;el.onclick=null;
  if(!params.serviceId||!params.date){el.innerHTML='<p class="hint">Choose a service and date to see open times.</p>';return;}
  el.innerHTML='<p class="hint">Loading open times...</p>';
  fetchSlots(params).then(function(list){
    if(el._tok!==tok)return;
    var slots=list.map(function(s){return {time:s.time,staffId:String(s.staffId)};});
    if(!slots.length){el.innerHTML='<p class="empty">No open times on this date. Try another day or barber.</p>';return;}
    var paint=function(sel){el.innerHTML=slots.map(function(s){return '<button type="button" class="slot'+(s.time===sel?' on':'')+'" data-time="'+s.time+'" data-staff="'+s.staffId+'">'+fmtTime(s.time)+'</button>';}).join('');};
    paint(selected);
    el.onclick=function(e){var b=e.target.closest('.slot');if(!b)return;onPick(b.dataset.time,b.dataset.staff);paint(b.dataset.time);};
  }).catch(function(){
    if(el._tok!==tok)return;
    el.innerHTML='<p class="err">Could not load open times. Check your connection.</p>';
  });
}

function badge(s){return '<span class="badge b-'+s+'">'+s.charAt(0).toUpperCase()+s.slice(1)+'</span>';}
function byTime(a,b){return (a.date+a.time).localeCompare(b.date+b.time);}

function openModal(html){var m=$('#modal');m.innerHTML='<div class="mbody">'+html+'</div>';if(!m.open)m.showModal();}
function closeModal(){var m=$('#modal');if(m.open)m.close();}
function askConfirm(title,msg,yesLabel,onYes){
  openModal('<h2>'+esc(title)+'</h2><p>'+esc(msg)+'</p><div class="mfoot"><button class="btn" data-close>Keep it</button><button class="btn primary" id="yesBtn">'+esc(yesLabel)+'</button></div>');
  $('#yesBtn').onclick=function(){closeModal();onYes();};
}

function render(){
  renderTop();
  if(ui.mode==='landing')renderLanding();
  else if(ui.mode==='public')renderBooking();
  else if(ui.mode==='login')renderLogin();
  else renderApp();
}
function renderTop(){
  var n=$('#topnav');
  var fl=$('#footLogin');if(fl)fl.style.display=session?'none':'';
  if(session){
    n.innerHTML='<span class="who">'+esc(session.name)+'<em>'+(session.role==='admin'?'Admin':'Staff')+'</em></span><button class="btn ghost" data-top="pw">Change password</button><button class="btn ghost" data-top="logout">Log out</button>';
  }else{
    n.innerHTML='<button class="btn ghost'+(ui.mode==='landing'?' cur':'')+'" data-top="home">Home</button><button class="btn ghost'+(ui.mode==='public'?' cur':'')+'" data-top="book">Request appointment</button>';
  }
}

/* ---------- Landing page ---------- */
function dayText(days){
  var order=[1,2,3,4,5,6,0],runs=[],cur=null;
  order.forEach(function(d){
    if(days.indexOf(d)>=0){if(cur)cur.end=d;else{cur={start:d,end:d};runs.push(cur);}}
    else cur=null;
  });
  return runs.map(function(r){return r.start===r.end?DAYS[r.start]:DAYS[r.start]+' to '+DAYS[r.end];}).join(', ')||'No days set';
}
function renderLanding(){
  api.get('/next-open').catch(function(){return null;}).then(function(nx){
    if(nx)return fetchSlots({serviceId:nx.serviceId,date:nx.date,staffId:'any'}).catch(function(){return [];}).then(function(sl){return {nx:nx,sl:sl};});
    return {nx:null,sl:[]};
  }).then(function(r){
    if(ui.mode!=='landing')return;
    drawLanding(r.nx,r.sl);
  });
}
function drawLanding(nx,sl){
  var svs=activeServices(),open=[],minS=1440,maxE=0;
  db.staff.forEach(function(s){
    s.days.forEach(function(d){if(open.indexOf(d)<0)open.push(d);});
    minS=Math.min(minS,toMin(s.start));maxE=Math.max(maxE,toMin(s.end));
  });
  var hours=db.staff.length?dayText(open)+', '+fmtTime(fromMin(minS))+' to '+fmtTime(fromMin(maxE)):'Hours to be announced';
  var dlabel=function(d){return d===todayISO()?'Today':d===addDays(todayISO(),1)?'Tomorrow':fmtDate(d);};
  var pill=nx?'Next open slot: '+dlabel(nx.date)+', '+fmtTime(nx.time):'Online booking is open';
  var widget;
  if(nx){
    var first=svc(nx.serviceId);
    var list=[first].concat(svs.filter(function(x){return x.id!==first.id;})).slice(0,3);
    var chipsS=list.map(function(s,i){return '<span class="chip'+(i===0?' on':'')+'">'+esc(s.name)+'</span>';}).join('');
    var chipsD=[0,1,2,3,4].map(function(i){var dt=parseD(addDays(nx.date,i));return '<span class="chip'+(i===0?' on':'')+'">'+dt.toLocaleDateString('en-PH',{weekday:'short'})+' '+dt.getDate()+'</span>';}).join('');
    widget='<div class="widget" aria-label="Preview of the booking form"><h3>Book a time</h3><div class="chips">'+chipsS+'</div><div class="chips">'+chipsD+'</div><div class="slots" style="margin-bottom:20px">'+sl.slice(0,8).map(function(s,i){return '<span class="slot'+(i===0?' on':'')+'">'+fmtTime(s.time)+'</span>';}).join('')+'</div><button class="btn primary big wide" data-top="book">Request appointment</button></div>';
  }else{
    widget='<div class="widget"><h3>Book a time</h3><p class="empty" style="margin-bottom:18px">All slots are taken for now. Send a request and we will get back to you.</p><button class="btn primary big wide" data-top="book">Request appointment</button></div>';
  }
  $('#main').innerHTML='<div class="wrap landing">'+
  '<section class="hero"><span class="pill"><i></i>'+pill+'</span><h1>Sharp cuts. Booked in a minute.</h1><p class="lead">ClipTop Barbers is a neighborhood barbershop for classic cuts, fades, and beard trims. Choose your barber and time online, no account needed.</p><div class="hero-act"><button class="btn primary big" data-top="book">Request appointment</button><a class="btn big" href="#services">See services and prices</a></div><p class="fine">Walk-ins welcome. Pay in cash at the shop.</p>'+
  '<div class="stage"><div class="pole-chip" aria-hidden="true"></div>'+widget+'<div class="float f1" aria-hidden="true">Confirmed<span>Fade haircut with Migs</span></div><div class="float f2" aria-hidden="true">Walk-in added<span>Jun, just now</span></div></div></section>'+
  '<section class="block" id="services"><h2>Services and prices</h2><p class="sub">Simple pricing. You pay in cash at the shop after your service.</p><div class="svc-list">'+(svs.length?svs.map(function(s){return '<div class="svc-row"><span class="n">'+esc(s.name)+'</span><span class="d">'+s.duration+' min</span><span class="p">'+peso(s.price)+'</span></div>';}).join(''):'<p class="empty" style="padding:16px 0">Services will be listed here soon.</p>')+'</div></section>'+
  '<section class="block"><h2>Meet your barbers</h2><p class="sub">Pick your favorite, or let us assign whoever is free first.</p><div class="barbers">'+db.staff.map(function(s){return '<div class="barber"><div class="avatar" aria-hidden="true">'+esc(s.name.charAt(0))+'</div><h3>'+esc(s.name)+'</h3><p class="muted">'+dayText(s.days)+', '+fmtTime(s.start)+' to '+fmtTime(s.end)+'</p><p style="margin-top:10px">'+esc(s.services.map(function(id){return svc(id).name;}).join(', '))+'</p></div>';}).join('')+'</div></section>'+
  '<section class="block"><h2>How booking works</h2><p class="sub">Three steps, and you never need an account.</p><ol class="steps"><li><strong>Choose</strong><br>A service, a barber, and an open time that suits you.</li><li><strong>Send</strong><br>Your request with your name and mobile number.</li><li><strong>Show up</strong><br>Once the shop confirms. You pay in cash.</li></ol></section>'+
  '<section class="block"><h2>Visit the shop</h2><div class="visit"><div class="info"><dl><dt>Open</dt><dd>'+esc(hours)+'</dd><dt>Address</dt><dd>123 Sample Street, Batangas City</dd><dt>Phone</dt><dd>0917 000 0000</dd></dl><p class="muted" style="margin-top:16px">Sample details for the prototype. These will be replaced with ClipTop\'s real information.</p></div><div class="mapbox" role="img" aria-label="Map placeholder"><span>Map of ClipTop Barbers will appear here</span></div></div></section>'+
  '<section class="cta"><h2>Ready for a fresh cut?</h2><p>Pick a time that works for you. It takes about a minute.</p><button class="btn primary big" data-top="book">Request appointment</button></section>'+
  '</div>';
}

/* ---------- Public booking ---------- */
var bk={serviceId:'',staffId:'any',date:'',time:'',slotStaff:''};
function renderBooking(){
  if(ui.done){
    var r=ui.done,sv=svc(r.serviceId);
    $('#main').innerHTML='<section class="wrap"><div class="card done" style="max-width:620px"><h2>Request received</h2><p>Thanks, '+esc(r.clientName)+'. The shop will confirm your slot.</p><div class="ref">Reference #'+r.id+'</div>'+
    '<dl style="margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 16px"><dt class="muted">Service</dt><dd style="margin:0">'+esc(sv.name)+' ('+peso(sv.price)+')</dd><dt class="muted">Barber</dt><dd style="margin:0">'+esc(r.staffName)+'</dd><dt class="muted">When</dt><dd style="margin:0">'+fmtDate(r.date)+', '+fmtTime(r.time)+'</dd><dt class="muted">Status</dt><dd style="margin:0">'+badge('pending')+'</dd></dl>'+
    (r.returning?'<div class="back">Welcome back. We found your profile and linked this booking to your visit history ('+r.prevVisits+' previous visit'+(r.prevVisits===1?'':'s')+').</div>':'<div class="back">A new client profile was created for you.</div>')+
    '<div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="again">Request another appointment</button><button class="btn" id="home">Back to home</button></div></div></section>';
    $('#again').onclick=function(){ui.done=null;renderBooking();};
    $('#home').onclick=function(){ui.done=null;ui.mode='landing';render();window.scrollTo(0,0);};
    return;
  }
  bk={serviceId:'',staffId:'any',date:todayISO(),time:'',slotStaff:''};
  $('#main').innerHTML='<section class="wrap"><div class="intro"><h1>Book your cut at ClipTop Barbers</h1><p>No account needed. Pick a service, a barber, and a time. Staff will confirm your request.</p></div>'+
  '<div class="book-grid"><form id="bookForm" class="card" novalidate>'+
  '<div class="row2"><label>Full name<input id="bName" autocomplete="name" placeholder="Juan Dela Cruz"></label><label>Mobile number<input id="bPhone" inputmode="tel" autocomplete="tel" placeholder="09XX XXX XXXX"></label></div>'+
  '<label>Service<select id="bService"></select></label>'+
  '<label>Barber<select id="bStaff"></select></label>'+
  '<label>Date<input type="date" id="bDate"></label>'+
  '<fieldset><legend>Available times</legend><div id="bSlots" class="slots"></div></fieldset>'+
  '<p id="bErr" class="err" role="alert"></p>'+
  '<button class="btn primary" type="submit">Request appointment</button></form>'+
  '<aside class="card sum" id="bSum"></aside></div></section>';
  var sSel=$('#bService');
  sSel.innerHTML='<option value="">Choose a service</option>'+activeServices().map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+' - '+peso(s.price)+'</option>';}).join('');
  var dEl=$('#bDate');dEl.min=todayISO();dEl.max=addDays(todayISO(),60);dEl.value=bk.date;
  var refreshStaff=function(){
    var elig=db.staff.filter(function(s){return !bk.serviceId||s.services.indexOf(bk.serviceId)>=0;});
    if(bk.staffId!=='any'&&!elig.some(function(s){return s.id===bk.staffId;}))bk.staffId='any';
    $('#bStaff').innerHTML='<option value="any">Any available barber</option>'+elig.map(function(s){return '<option value="'+s.id+'"'+(s.id===bk.staffId?' selected':'')+'>'+esc(s.name)+'</option>';}).join('');
  };
  var refreshSlots=function(){
    renderSlots($('#bSlots'),{serviceId:bk.serviceId,date:bk.date,staffId:bk.staffId},bk.time,function(t,s){bk.time=t;bk.slotStaff=s;refreshSum();});
  };
  var refreshSum=function(){
    var sv=bk.serviceId?svc(bk.serviceId):null;
    var who=bk.staffId==='any'?(bk.slotStaff&&bk.time?stf(bk.slotStaff).name+' (first available)':'Any available barber'):stf(bk.staffId).name;
    $('#bSum').innerHTML='<h3>Your booking</h3><dl><dt>Service</dt><dd>'+(sv?esc(sv.name):'Not chosen yet')+'</dd><dt>Duration</dt><dd>'+(sv?sv.duration+' min':'-')+'</dd><dt>Price</dt><dd>'+(sv?peso(sv.price):'-')+'</dd><dt>Barber</dt><dd>'+esc(who)+'</dd><dt>When</dt><dd>'+(bk.date&&bk.time?fmtDate(bk.date)+', '+fmtTime(bk.time):'Pick a time')+'</dd></dl><p class="note">Payment is made in cash at the shop. Your request stays pending until staff confirm it.</p>';
  };
  refreshStaff();refreshSlots();refreshSum();
  sSel.onchange=function(){bk.serviceId=sSel.value;bk.time='';bk.slotStaff='';refreshStaff();refreshSlots();refreshSum();};
  $('#bStaff').onchange=function(e){bk.staffId=e.target.value;bk.time='';bk.slotStaff='';refreshSlots();refreshSum();};
  dEl.onchange=function(){bk.date=dEl.value;bk.time='';bk.slotStaff='';refreshSlots();refreshSum();};
  $('#bookForm').onsubmit=function(e){
    e.preventDefault();
    var err=$('#bErr'),btn=this.querySelector('button[type=submit]'),name=$('#bName').value.trim(),phone=$('#bPhone').value;
    if(name.length<2){err.textContent='Enter your full name.';return;}
    if(!validPhone(phone)){err.textContent='Enter a valid mobile number, like 0917 123 4567.';return;}
    if(!bk.serviceId){err.textContent='Choose a service.';return;}
    if(!bk.date||!bk.time){err.textContent='Pick a date and an available time.';return;}
    err.textContent='';btn.disabled=true;
    api.post('/appointments/public',{name:name,contact:phone,serviceId:bk.serviceId,staffId:bk.staffId==='any'?bk.slotStaff:bk.staffId,anyStaff:bk.staffId==='any',date:bk.date,time:bk.time})
    .then(function(res){ui.done=res;renderBooking();})
    .catch(function(ex){err.textContent=ex.message;bk.time='';bk.slotStaff='';btn.disabled=false;refreshSlots();refreshSum();});
  };
}

/* ---------- Login ---------- */
function renderLogin(){
  $('#main').innerHTML='<section class="wrap"><div class="card login"><h1>Staff login</h1><form id="loginForm" novalidate><label>Username<input id="lUser" autocomplete="username"></label><label>Password<input id="lPass" type="password" autocomplete="current-password"></label><p id="lErr" class="err" role="alert"></p><button class="btn primary" type="submit">Log in</button></form><div class="demo"><strong>Demo accounts</strong><br>Admin: admin / admin123<br>Staff: migs / staff123</div></div></section>';
  $('#loginForm').onsubmit=function(e){
    e.preventDefault();
    var err=$('#lErr');err.textContent='';
    api.post('/auth/login',{username:$('#lUser').value.trim(),password:$('#lPass').value})
    .then(function(u){session=u;return loadStaffData();})
    .then(function(){ui.mode='app';ui.view='dashboard';render();})
    .catch(function(ex){session=null;err.textContent=ex.message||'Could not log in.';});
  };
}

/* ---------- App shell ---------- */
function renderApp(){
  var items=[['dashboard','Dashboard'],['appointments','Appointments'],['schedule','Schedule'],['clients','Clients']];
  if(session.role==='admin')items=items.concat([['services','Services and pricing'],['staff','Staff and hours'],['audit','Audit log']]);
  if(!items.some(function(i){return i[0]===ui.view;}))ui.view='dashboard';
  $('#main').innerHTML='<div class="shell"><nav class="side" aria-label="Sections">'+items.map(function(i){return '<button class="navb'+(ui.view===i[0]?' cur':'')+'" data-view="'+i[0]+'">'+i[1]+'</button>';}).join('')+'</nav><section class="content" id="content"></section></div>';
  ({dashboard:viewDashboard,appointments:viewAppointments,schedule:viewSchedule,clients:viewClients,services:viewServices,staff:viewStaff,audit:viewAudit})[ui.view]();
}

function untilLabel(a){
  if(a.date!==todayISO()||(a.status!=='pending'&&a.status!=='confirmed'))return '';
  var diff=toMin(a.time)-nowMin();
  if(diff>60)return '<span class="until">in '+Math.floor(diff/60)+' h '+(diff%60)+' min</span>';
  if(diff>0)return '<span class="until">in '+diff+' min</span>';
  if(diff>-30)return '<span class="until">Starting now</span>';
  return '<span class="until warn">Past start time</span>';
}
function viewDashboard(){
  var t=todayISO();
  var todays=db.appointments.filter(function(a){return a.date===t&&a.status!=='cancelled';}).sort(byTime);
  var pending=db.appointments.filter(function(a){return a.status==='pending';}).sort(byTime);
  var done=todays.filter(function(a){return a.status==='completed';}).length;
  var upcoming=todays.filter(function(a){return a.status==='confirmed';}).length;
  var overdue=todays.filter(function(a){return a.status==='confirmed'&&toMin(a.time)<nowMin()-30;});
  var pendHtml=pending.length?pending.slice(0,6).map(function(a){return '<li><div class="l"><strong>'+esc(a.clientName)+'</strong><br><span class="muted">'+esc(a.serviceName)+' with '+esc(a.staffName)+', '+fmtDate(a.date)+' '+fmtTime(a.time)+'</span></div><button class="btn sm primary" data-act="confirmed" data-id="'+a.id+'">Confirm</button></li>';}).join(''):'<li><span class="empty">No pending requests. New online bookings will show up here.</span></li>';
  var odHtml=overdue.map(function(a){return '<li><div class="l"><strong>'+esc(a.clientName)+'</strong><br><span class="muted">Was due '+fmtTime(a.time)+' with '+esc(a.staffName)+'</span></div><span><button class="btn sm primary" data-act="completed" data-id="'+a.id+'">Complete</button><button class="btn sm" data-act="no-show" data-id="'+a.id+'">No-show</button></span></li>';}).join('');
  var todayHtml=todays.length?todays.map(function(a){return '<li><div class="l"><strong>'+fmtTime(a.time)+'</strong> '+esc(a.clientName)+'<br><span class="muted">'+esc(a.serviceName)+' with '+esc(a.staffName)+'</span></div><span style="text-align:right">'+badge(a.status)+'<br>'+untilLabel(a)+'</span></li>';}).join(''):'<li><span class="empty">No bookings today.</span></li>';
  $('#content').innerHTML='<div class="head"><h1>Dashboard</h1><button class="btn primary" data-act="walkin">Add walk-in</button></div>'+
  '<div class="stats"><div class="stat"><b>'+todays.length+'</b><span>Bookings today</span></div><div class="stat"><b>'+pending.length+'</b><span>Pending requests</span></div><div class="stat"><b>'+upcoming+'</b><span>Confirmed, still to come</span></div><div class="stat"><b>'+done+'</b><span>Completed today</span></div></div>'+
  '<div class="two"><div class="card"><h2>Needs your attention</h2><ul class="list">'+odHtml+pendHtml+'</ul></div><div class="card"><h2>Today\'s bookings</h2><ul class="list">'+todayHtml+'</ul></div></div>';
}

function sortApts(list){
  var t=todayISO();
  var up=list.filter(function(a){return a.date>=t;}).sort(byTime);
  var past=list.filter(function(a){return a.date<t;}).sort(byTime).reverse();
  return up.concat(past);
}
function aptActions(a){
  var b=function(act,label,cls){return '<button class="btn sm '+(cls||'')+'" data-act="'+act+'" data-id="'+a.id+'">'+label+'</button>';};
  if(a.status==='pending')return b('confirmed','Confirm','primary')+b('resched','Reschedule')+b('cancelled','Cancel','danger');
  if(a.status==='confirmed')return b('completed','Complete','primary')+b('no-show','No-show')+b('resched','Reschedule')+b('cancelled','Cancel','danger');
  return '<span class="muted">No actions</span>';
}
function viewAppointments(){
  $('#content').innerHTML='<div class="head"><h1>Appointments</h1><button class="btn primary" data-act="walkin">Add walk-in</button></div>'+
  '<div class="card filters"><label>Search client<input data-f="q" type="search" placeholder="Name or number" value="'+esc(filt.q)+'"></label>'+
  '<label>Date<input data-f="date" type="date" value="'+filt.date+'"></label>'+
  '<label>Status<select data-f="status"><option value="">All statuses</option>'+['pending','confirmed','completed','cancelled','no-show'].map(function(s){return '<option value="'+s+'"'+(filt.status===s?' selected':'')+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>';}).join('')+'</select></label>'+
  '<label>Barber<select data-f="staff"><option value="">All barbers</option>'+db.staff.map(function(s){return '<option value="'+s.id+'"'+(filt.staff===s.id?' selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select></label>'+
  '<button class="btn ghost" data-act="clearf" style="margin-bottom:14px">Clear filters</button></div>'+
  '<div class="card tablewrap"><table><thead><tr><th>When</th><th>Client</th><th>Service</th><th>Barber</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead><tbody id="aptBody"></tbody></table></div><p class="muted" id="aptCount" style="margin-top:8px"></p>';
  renderAptTable();
}
function renderAptTable(){
  var q=filt.q.trim().toLowerCase(),qd=normPhone(filt.q);
  var list=db.appointments.filter(function(a){
    if(q&&a.clientName.toLowerCase().indexOf(q)<0&&!(qd&&a.contact.indexOf(qd)>=0))return false;
    if(filt.date&&a.date!==filt.date)return false;
    if(filt.status&&a.status!==filt.status)return false;
    if(filt.staff&&a.staffId!==filt.staff)return false;
    return true;
  });
  list=sortApts(list);
  $('#aptBody').innerHTML=list.length?list.map(function(a){
    return '<tr><td><strong>'+fmtTime(a.time)+'</strong><br><span class="muted">'+fmtDate(a.date)+'</span></td><td>'+esc(a.clientName)+'<br><span class="muted">'+esc(a.contact||'No number')+'</span></td><td>'+esc(a.serviceName)+'<br><span class="muted">'+peso(a.price)+', '+a.duration+' min</span></td><td>'+esc(a.staffName)+'</td><td>'+(a.source==='walk-in'?'Walk-in':'Online')+'</td><td>'+badge(a.status)+'</td><td class="acts">'+aptActions(a)+'</td></tr>';
  }).join(''):'<tr><td colspan="7"><span class="empty">No appointments match these filters.</span></td></tr>';
  $('#aptCount').textContent=list.length+' appointment'+(list.length===1?'':'s')+' shown';
}

function viewSchedule(){
  var dow=parseD(sched.date).getDay();
  var cols=db.staff.map(function(s){
    var works=s.days.indexOf(dow)>=0;
    var list=db.appointments.filter(function(a){return a.staffId===s.id&&a.date===sched.date&&a.status!=='cancelled';}).sort(byTime);
    var body=!works?'<p class="off">Day off</p>':list.length?list.map(function(a){var cls=a.status==='pending'?'pending':a.status==='completed'?'done':'';return '<div class="blk '+cls+'"><strong>'+fmtTime(a.time)+' to '+fmtTime(fromMin(toMin(a.time)+a.duration))+'</strong><br>'+esc(a.clientName)+'<br><span class="muted">'+esc(a.serviceName)+'</span> '+badge(a.status)+'</div>';}).join(''):'<p class="off">No bookings yet.</p>';
    return '<div class="card col"><h3>'+esc(s.name)+'</h3><span class="muted">'+(works?fmtTime(s.start)+' to '+fmtTime(s.end):'Not working')+'</span>'+body+'</div>';
  }).join('');
  $('#content').innerHTML='<div class="head"><h1>Schedule</h1><div class="pick"><button class="btn" data-act="dprev" aria-label="Previous day">Previous</button><input type="date" id="schedDate" value="'+sched.date+'"><button class="btn" data-act="dnext" aria-label="Next day">Next</button><button class="btn ghost" data-act="dtoday">Today</button></div></div><p class="muted" style="margin-bottom:12px">'+fmtDate(sched.date)+'</p><div class="cols">'+cols+'</div>';
  $('#schedDate').onchange=function(e){if(e.target.value){sched.date=e.target.value;viewSchedule();}};
}

function viewClients(){
  $('#content').innerHTML='<div class="head"><h1>Clients</h1></div><div class="card filters" style="grid-template-columns:1fr"><label>Search clients<input data-f="cq" type="search" placeholder="Name or contact number" value="'+esc(cq.q)+'"></label></div><div class="card tablewrap"><table><thead><tr><th>Client</th><th>Contact</th><th>Visits</th><th>Last visit</th><th>Frequent services</th><th></th></tr></thead><tbody id="cBody"></tbody></table></div>';
  renderClientTable();
}
function renderClientTable(){
  var q=cq.q.trim().toLowerCase(),qd=normPhone(cq.q);
  var list=db.clients.filter(function(c){return !q||c.name.toLowerCase().indexOf(q)>=0||(qd&&c.contact.indexOf(qd)>=0);});
  list.sort(function(a,b){return (b.lastVisit||'').localeCompare(a.lastVisit||'');});
  $('#cBody').innerHTML=list.length?list.map(function(c){return '<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.contact||'No number')+'</td><td>'+c.visits+'</td><td>'+(c.lastVisit?fmtDate(c.lastVisit):'No visits yet')+'</td><td>'+(c.fav.length?esc(c.fav.join(', ')):'-')+'</td><td><button class="btn sm" data-act="history" data-id="'+c.id+'">View history</button></td></tr>';}).join(''):'<tr><td colspan="6"><span class="empty">No clients match your search.</span></td></tr>';
}
function openHistory(id){
  return api.get('/clients/'+id+'/history').then(function(r){
    var c=r.client,list=r.visits;
    var done=list.filter(function(a){return a.status==='completed';}).length;
    openModal('<h2>'+esc(c.name)+'</h2><p class="muted" style="margin-bottom:12px">'+esc(c.contact||'No number')+' &nbsp; '+done+' completed visit'+(done===1?'':'s')+'</p><ul class="list" style="max-height:50vh;overflow:auto">'+(list.length?list.map(function(a){return '<li><div class="l"><strong>'+fmtDate(a.date)+', '+fmtTime(a.time)+'</strong><br><span class="muted">'+esc(a.serviceName)+' with '+esc(a.staffName)+'</span></div>'+badge(a.status)+'</li>';}).join(''):'<li><span class="empty">No visits recorded.</span></li>')+'</ul><div class="mfoot"><button class="btn" data-close>Close</button></div>');
  });
}

function viewServices(){
  var list=activeServices();
  $('#content').innerHTML='<div class="head"><h1>Services and pricing</h1><button class="btn primary" data-act="svc-add">Add service</button></div><div class="card tablewrap"><table><thead><tr><th>Service</th><th>Price</th><th>Duration</th><th></th></tr></thead><tbody>'+(list.length?list.map(function(s){return '<tr><td><strong>'+esc(s.name)+'</strong></td><td>'+peso(s.price)+'</td><td>'+s.duration+' min</td><td><button class="btn sm" data-act="svc-edit" data-id="'+s.id+'">Edit</button><button class="btn sm danger" data-act="svc-del" data-id="'+s.id+'">Remove</button></td></tr>';}).join(''):'<tr><td colspan="4"><span class="empty">No services yet. Add one so clients can book it.</span></td></tr>')+'</tbody></table></div><p class="muted" style="margin-top:8px">Services here appear on the public booking form and in billing.</p>';
}
function serviceModal(id){
  var s=id?svc(id):{name:'',price:150,duration:30};
  var durs=[15,30,45,60,75,90,120];
  openModal('<h2>'+(id?'Edit service':'Add service')+'</h2><form id="svcForm" novalidate><label>Service name<input id="fName" value="'+esc(s.name)+'"></label><div class="row2"><label>Price (PHP)<input id="fPrice" type="number" min="0" step="10" value="'+s.price+'"></label><label>Duration<select id="fDur">'+durs.map(function(d){return '<option value="'+d+'"'+(d===s.duration?' selected':'')+'>'+d+' min</option>';}).join('')+'</select></label></div><p class="err" id="fErr" role="alert"></p><div class="mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save service</button></div></form>');
  $('#svcForm').onsubmit=function(e){
    e.preventDefault();
    var name=$('#fName').value.trim(),price=Number($('#fPrice').value),dur=Number($('#fDur').value);
    if(!name){$('#fErr').textContent='Enter a service name.';return;}
    if(!(price>=0)||$('#fPrice').value===''){$('#fErr').textContent='Enter a valid price.';return;}
    var body={name:name,price:price,duration:dur};
    (id?api.put('/services/'+id,body):api.post('/services',body))
    .then(function(){closeModal();return refresh();})
    .then(function(){toast('Service saved');})
    .catch(function(ex){$('#fErr').textContent=ex.message;});
  };
}

function viewStaff(){
  $('#content').innerHTML='<div class="head"><h1>Staff and hours</h1></div><div class="scards">'+db.staff.map(function(s){return '<div class="card"><h2>'+esc(s.name)+'</h2><dl><dt>Hours</dt><dd>'+fmtTime(s.start)+' to '+fmtTime(s.end)+'</dd><dt>Works</dt><dd>'+(s.days.length?s.days.map(function(d){return DAYS[d];}).join(', '):'No days set')+'</dd><dt>Services</dt><dd>'+(s.services.length?esc(s.services.map(function(id){return svc(id).name;}).join(', ')):'None assigned')+'</dd></dl><button class="btn" data-act="staff-edit" data-id="'+s.id+'">Edit hours and services</button></div>';}).join('')+'</div>';
}
function staffModal(id){
  var s=stf(id),times=[];
  for(var m=360;m<=1320;m+=30)times.push(fromMin(m));
  var opt=function(v){return times.map(function(t){return '<option value="'+t+'"'+(t===v?' selected':'')+'>'+fmtTime(t)+'</option>';}).join('');};
  openModal('<h2>'+esc(s.name)+'</h2><form id="stForm" novalidate><div class="row2"><label>Starts<select id="sStart">'+opt(s.start)+'</select></label><label>Ends<select id="sEnd">'+opt(s.end)+'</select></label></div><fieldset><legend>Working days</legend><div class="checks">'+[1,2,3,4,5,6,0].map(function(d){return '<label><input type="checkbox" name="day" value="'+d+'"'+(s.days.indexOf(d)>=0?' checked':'')+'>'+DAYS[d]+'</label>';}).join('')+'</div></fieldset><fieldset><legend>Services this barber can perform</legend><div class="checks">'+activeServices().map(function(v){return '<label><input type="checkbox" name="svc" value="'+v.id+'"'+(s.services.indexOf(v.id)>=0?' checked':'')+'>'+esc(v.name)+'</label>';}).join('')+'</div></fieldset><p class="err" id="sErr" role="alert"></p><div class="mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save changes</button></div></form>');
  $('#stForm').onsubmit=function(e){
    e.preventDefault();
    var a=$('#sStart').value,b=$('#sEnd').value;
    if(toMin(b)<=toMin(a)){$('#sErr').textContent='The end time must be after the start time.';return;}
    var days=[].slice.call(document.querySelectorAll('#stForm input[name=day]:checked')).map(function(x){return Number(x.value);});
    var services=[].slice.call(document.querySelectorAll('#stForm input[name=svc]:checked')).map(function(x){return Number(x.value);});
    api.put('/staff/'+id,{start:a,end:b,days:days,services:services})
    .then(function(){closeModal();return refresh();})
    .then(function(){toast('Staff schedule saved');})
    .catch(function(ex){$('#sErr').textContent=ex.message;});
  };
}

function viewAudit(){
  $('#content').innerHTML='<div class="head"><h1>Audit log</h1></div><div class="card"><ul class="list">'+db.audit.slice(0,100).map(function(l){return '<li><div class="l">'+esc(l.text)+'</div><span class="muted" style="white-space:nowrap">'+new Date(l.ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</span></li>';}).join('')+'</ul></div>';
}

/* ---------- Actions ---------- */
function setStatus(id,status){
  return api.patch('/appointments/'+id+'/status',{status:status}).then(function(){return refresh();}).then(function(){toast('Appointment #'+id+' marked as '+status);});
}
function walkinModal(){
  var w={serviceId:'',staffId:'any',date:todayISO(),time:'',slotStaff:''};
  openModal('<h2>Add walk-in</h2><form id="wForm" novalidate><div class="row2"><label>Client name<input id="wName"></label><label>Mobile number (optional)<input id="wPhone" inputmode="tel" placeholder="09XX XXX XXXX"></label></div><label>Service<select id="wService"><option value="">Choose a service</option>'+activeServices().map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+' - '+peso(s.price)+'</option>';}).join('')+'</select></label><label>Barber<select id="wStaff"></select></label><label>Date<input type="date" id="wDate" value="'+w.date+'" min="'+todayISO()+'"></label><fieldset><legend>Open times</legend><div class="slots" id="wSlots"></div></fieldset><p class="err" id="wErr" role="alert"></p><div class="mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Add walk-in</button></div></form>');
  var refStaff=function(){
    var elig=db.staff.filter(function(s){return !w.serviceId||s.services.indexOf(w.serviceId)>=0;});
    if(w.staffId!=='any'&&!elig.some(function(s){return s.id===w.staffId;}))w.staffId='any';
    $('#wStaff').innerHTML='<option value="any">Any available barber</option>'+elig.map(function(s){return '<option value="'+s.id+'"'+(s.id===w.staffId?' selected':'')+'>'+esc(s.name)+'</option>';}).join('');
  };
  var refSlots=function(){renderSlots($('#wSlots'),{serviceId:w.serviceId,date:w.date,staffId:w.staffId,allowPast:true},w.time,function(t,s){w.time=t;w.slotStaff=s;});};
  refStaff();refSlots();
  $('#wService').onchange=function(e){w.serviceId=e.target.value;w.time='';refStaff();refSlots();};
  $('#wStaff').onchange=function(e){w.staffId=e.target.value;w.time='';refSlots();};
  $('#wDate').onchange=function(e){w.date=e.target.value;w.time='';refSlots();};
  $('#wForm').onsubmit=function(e){
    e.preventDefault();
    var err=$('#wErr'),name=$('#wName').value.trim(),phone=$('#wPhone').value.trim();
    if(name.length<2){err.textContent='Enter the client name.';return;}
    if(phone&&!validPhone(phone)){err.textContent='Enter a valid mobile number or leave it blank.';return;}
    if(!w.serviceId){err.textContent='Choose a service.';return;}
    if(!w.time){err.textContent='Pick an open time.';return;}
    err.textContent='';
    api.post('/appointments/walk-in',{name:name,contact:phone,serviceId:w.serviceId,staffId:w.staffId==='any'?w.slotStaff:w.staffId,anyStaff:w.staffId==='any',date:w.date,time:w.time})
    .then(function(res){closeModal();return refresh().then(function(){toast('Walk-in added to '+res.staffName+"'s schedule");});})
    .catch(function(ex){err.textContent=ex.message;w.time='';refSlots();});
  };
}
function reschedModal(id){
  var a=apt(id);if(!a)return;
  var r={date:a.date,time:''};
  openModal('<h2>Reschedule Appointment #'+a.id+'</h2><p class="muted" style="margin-bottom:12px">'+esc(a.clientName)+', '+esc(a.serviceName)+' with '+esc(a.staffName)+'</p><form id="rForm" novalidate><label>New date<input type="date" id="rDate" value="'+a.date+'" min="'+todayISO()+'"></label><fieldset><legend>Open times</legend><div class="slots" id="rSlots"></div></fieldset><p class="err" id="rErr" role="alert"></p><div class="mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save new time</button></div></form>');
  var ref=function(){renderSlots($('#rSlots'),{serviceId:a.serviceId,date:r.date,staffId:a.staffId,ignoreId:a.id},r.time,function(t){r.time=t;});};
  ref();
  $('#rDate').onchange=function(e){r.date=e.target.value;r.time='';ref();};
  $('#rForm').onsubmit=function(e){
    e.preventDefault();
    if(!r.time){$('#rErr').textContent='Pick an open time.';return;}
    api.patch('/appointments/'+a.id+'/reschedule',{date:r.date,time:r.time})
    .then(function(){closeModal();return refresh();})
    .then(function(){toast('Appointment #'+a.id+' rescheduled');})
    .catch(function(ex){$('#rErr').textContent=ex.message;r.time='';ref();});
  };
}
function pwModal(){
  openModal('<h2>Change password</h2><form id="pwForm" novalidate><label>Current password<input id="pCur" type="password" autocomplete="current-password"></label><label>New password<input id="pNew" type="password" autocomplete="new-password"></label><label>Confirm new password<input id="pCon" type="password" autocomplete="new-password"></label><p class="err" id="pErr" role="alert"></p><div class="mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Update password</button></div></form>');
  $('#pwForm').onsubmit=function(e){
    e.preventDefault();
    if($('#pNew').value.length<6){$('#pErr').textContent='Use at least 6 characters.';return;}
    if($('#pNew').value!==$('#pCon').value){$('#pErr').textContent='The new passwords do not match.';return;}
    api.post('/auth/password',{current:$('#pCur').value,password:$('#pNew').value})
    .then(function(){closeModal();toast('Password updated');})
    .catch(function(ex){$('#pErr').textContent=ex.message;});
  };
}

/* ---------- Events ---------- */
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-top],[data-view],[data-act],[data-close]');
  if(!el){if(e.target===$('#modal'))closeModal();return;}
  if(el.hasAttribute('data-close')){closeModal();return;}
  if(el.dataset.top){
    var t=el.dataset.top;
    if(t==='book'||t==='home'){e.preventDefault();if(session)return;ui.mode=(t==='home'?'landing':'public');ui.done=null;render();window.scrollTo(0,0);}
    else if(t==='login'){ui.mode='login';render();}
    else if(t==='logout'){run(function(){return api.post('/auth/logout').then(function(){location.reload();});});}
    else if(t==='pw')pwModal();
    return;
  }
  if(el.dataset.view){ui.view=el.dataset.view;render();return;}
  var act=el.dataset.act,id=el.dataset.id;
  if(act==='confirmed'||act==='completed'||act==='no-show'){run(function(){return setStatus(id,act);});}
  else if(act==='cancelled'){var a=apt(id);askConfirm('Cancel appointment #'+id+'?',a.clientName+' will be removed from '+a.staffName+"'s schedule and the time slot opens up again.",'Cancel appointment',function(){run(function(){return setStatus(id,'cancelled');});});}
  else if(act==='resched')reschedModal(id);
  else if(act==='walkin')walkinModal();
  else if(act==='clearf'){filt={q:'',date:'',status:'',staff:''};viewAppointments();}
  else if(act==='history'){run(function(){return openHistory(id);});}
  else if(act==='svc-add')serviceModal();
  else if(act==='svc-edit')serviceModal(id);
  else if(act==='svc-del'){askConfirm('Remove '+svc(id).name+'?','It will no longer appear on the booking form. Past appointments keep their record.','Remove service',function(){run(function(){return api.del('/services/'+id).then(function(){return refresh();}).then(function(){toast('Service removed');});});});}
  else if(act==='staff-edit')staffModal(id);
  else if(act==='dprev'){sched.date=addDays(sched.date,-1);viewSchedule();}
  else if(act==='dnext'){sched.date=addDays(sched.date,1);viewSchedule();}
  else if(act==='dtoday'){sched.date=todayISO();viewSchedule();}
});
document.addEventListener('input',function(e){
  var f=e.target.dataset&&e.target.dataset.f;if(!f)return;
  if(f==='cq'){cq.q=e.target.value;renderClientTable();}
  else{filt[f]=e.target.value;renderAptTable();}
});
$('#modal').addEventListener('close',function(){$('#modal').innerHTML='';});

/* ---------- Start ---------- */
function init(){
  var rb=document.querySelector('[data-top="reset"]');if(rb)rb.remove();
  var ft=document.querySelector('.foot span');if(ft)ft.textContent='ClipTrack prototype for Sprint 1 and 2 modules.';
  $('#main').innerHTML='<div class="wrap"><p class="hint">Loading...</p></div>';
  loadPublic().then(function(){
    // If the staff member is still logged in (page refresh), go straight back to the dashboard.
    return api.get('/auth/me').then(function(u){session=u;return loadStaffData();}).then(function(){ui.mode='app';ui.view='dashboard';}).catch(function(){session=null;});
  }).then(function(){render();})
  .catch(function(){
    $('#main').innerHTML='<div class="wrap"><div class="card" style="max-width:560px"><h2>Cannot reach the server</h2><p style="margin-top:8px">Make sure the server is running (php artisan serve) and MySQL is started, then refresh this page.</p></div></div>';
  });
}
init();
})();
