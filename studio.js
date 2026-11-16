(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const profileId = ["perfil-1", "perfil-2"].includes(params.get("profile")) ? params.get("profile") : "perfil-1";
  const storageKey = window.HATTZ_CORE?.profileStorageKey?.(profileId) || `meuPerfil:${profileId}`;
  const API = String(window.HATTZ_CORE?.apiBase?.() || window.HATTZ_SHARE_CONFIG?.apiBase || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const defaults = {glass:{opacity:72,blur:18,reflection:42,glow:28,border:45,depth:42},cards:{},avatar:{size:150,thickness:2,offsetX:0,offsetY:0,lighting:65,frameScale:100,frameX:0,frameY:0}};
  let profile;
  let toastTimer = 0;
  let previewFrame = 0;
  let previewStatusTimer = 0;
  try { profile = JSON.parse(localStorage.getItem(storageKey) || (profileId === "perfil-1" ? localStorage.getItem("meuPerfil") : "null") || "null") || {}; }
  catch { profile = {}; }
  profile.studio = window.HATTZ_PROFILE_CONTRACT?.normalizeStudio(profile.studio) || { ...structuredClone(defaults), ...(profile.studio || {}), glass:{...defaults.glass,...(profile.studio?.glass||{})}, cards:{...(profile.studio?.cards||{})}, avatar:{...defaults.avatar,...(profile.studio?.avatar||{})} };
  $("activeProfileLabel").textContent = profileId === "perfil-1" ? "Perfil 1" : "Perfil 2";
  $("backToProfile").href = `./index.html?profile=${profileId}`;
  $("profilePreview").src = `./index.html?profile=${profileId}&studioPreview=${Date.now()}`;
  function toast(message){const el=$("studioToast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600);}
  function renderGlass(){for(const [key,value] of Object.entries(profile.studio.glass)){const input=document.querySelector(`[data-glass="${key}"]`);if(input)input.value=value;const out=$(`${key}Out`);if(out)out.textContent=key==="blur"?`${value} px`:`${value}%`;}}
  function renderAvatar(){for(const [key,value] of Object.entries(profile.studio.avatar)){const input=document.querySelector(`[data-avatar="${key}"]`);if(input)input.value=value;const out=$(`avatar${key[0].toUpperCase()+key.slice(1)}Out`);if(out)out.textContent=key==="size"||key.startsWith("offset")||key==="thickness"||key==="frameX"||key==="frameY"?`${value} px`:`${value}%`;}}
  function renderCard(){const key=$("cardTarget").value, item=profile.studio.cards[key]||{};for(const [prop,id] of [["opacity","cardOpacity"],["blur","cardBlur"],["glow","cardGlow"]]){const input=$(id),out=$(id+"Out");input.value=item[prop]??profile.studio.glass[prop];out.textContent=item[prop]===undefined?"Global":`${item[prop]}${prop==="blur"?" px":"%"}`;}}
  function applyPreview(){
    $("previewState").textContent="Atualizando…";
    if(previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame=requestAnimationFrame(()=>{
      previewFrame=0;
      const frame=$("profilePreview");
      try { frame.contentWindow?.postMessage({type:"HATTZ_STUDIO_PREVIEW_REFRESH"}, location.origin); }
      catch { frame.contentWindow?.location.reload(); }
      clearTimeout(previewStatusTimer);
      previewStatusTimer=setTimeout(()=>$("previewState").textContent="Atualizado",180);
    });
  }
  document.querySelectorAll(".studio-nav").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".studio-nav").forEach(x=>x.classList.toggle("active",x===btn));document.querySelectorAll(".studio-panel").forEach(x=>x.classList.toggle("active",x.id===`panel-${btn.dataset.panel}`));}));
  document.querySelectorAll("[data-glass]").forEach(input=>input.addEventListener("input",()=>{const key=input.dataset.glass;profile.studio.glass[key]=Number(input.value);renderGlass();save(false);}));
  document.querySelectorAll("[data-avatar]").forEach(input=>input.addEventListener("input",()=>{const key=input.dataset.avatar;profile.studio.avatar[key]=Number(input.value);renderAvatar();save(false);}));
  $("cardTarget").addEventListener("change",renderCard);
  [["cardOpacity","opacity"],["cardBlur","blur"],["cardGlow","glow"]].forEach(([id,key])=>$(id).addEventListener("input",()=>{const target=$("cardTarget").value;profile.studio.cards[target]={...(profile.studio.cards[target]||{}),[key]:Number($(id).value)};renderCard();save(false);}));
  $("resetCard").addEventListener("click",()=>{delete profile.studio.cards[$("cardTarget").value];renderCard();save(false);});
  document.querySelectorAll("[data-frame]").forEach(btn=>btn.addEventListener("click",()=>{if(btn.dataset.frame==="amethyst" && btn.disabled){toast("A moldura Amethyst precisa ser concedida ao perfil pelo Control.");return;}profile.moldura=btn.dataset.frame;if(btn.dataset.frame==="amethyst")profile.raridadeMoldura="elite";document.querySelectorAll("[data-frame]").forEach(x=>x.classList.toggle("selected",x===btn));save(false);}));
  function save(show=true){if(window.HATTZ_CORE?.setProfile)window.HATTZ_CORE.setProfile(profileId,profile);else localStorage.setItem(storageKey,JSON.stringify(profile));applyPreview();if(show)toast("Personalização salva neste perfil.");}
  $("profilePreview").addEventListener("load",()=>{ try { $("profilePreview").contentWindow.postMessage({type:"HATTZ_STUDIO_PREVIEW_REFRESH"}, location.origin); } catch {} });
  $("saveStudio").addEventListener("click",()=>save(true));
  let themeAllowed = false;
  let profileCode = "";
  async function loadThemeAccess() {
    profileCode = localStorage.getItem(`hattz-share-code:${profileId}`) || "";
    const normalized = window.HATTZ_CORE?.normalizeCode?.(profileCode) || profileCode.replace(/[^A-Z0-9]/gi, "").replace(/^HTZ/i, "").toUpperCase();
    const nav = $("themeNav"), panel = $("panel-theme");
    if (!API || !normalized) { nav.hidden=true; panel.hidden=true; return; }
    try {
      const response = await fetch(`${API}/api/profiles/${normalized}/entitlements`, {cache:"no-store"});
      if (!response.ok) throw new Error("Não foi possível verificar os cargos deste perfil.");
      const info = await response.json();
      themeAllowed = info.studioThemeAllowed === true;
      nav.hidden = !themeAllowed; panel.hidden = !themeAllowed;
      if (themeAllowed) {
        const theme = info.profileTheme || {};
        document.querySelectorAll("[data-theme]").forEach(input => { input.value = theme[input.dataset.theme] || input.value; });
        $("themeAccessNote").textContent = "Acesso liberado pelo cargo. As alterações serão salvas apenas neste perfil.";
      }
    } catch(error) { nav.hidden=true; panel.hidden=true; $("themeAccessNote").textContent=error.message; }
  }
  async function saveProfileTheme() {
    if (!themeAllowed || !profileCode) { toast("Este perfil não possui acesso ao editor de tema."); return; }
    const ownerToken = localStorage.getItem(`hattz-share-owner:${profileId}`) || "";
    if (!ownerToken) { toast("Chave privada do perfil não encontrada. Abra o perfil e sincronize-o primeiro."); return; }
    const theme = Object.fromEntries([...document.querySelectorAll("[data-theme]")].map(input=>[input.dataset.theme,input.value]));
    try {
      const normalized = profileCode.replace(/[^A-Z0-9]/gi, "").replace(/^HTZ/i, "").toUpperCase();
      const response = await fetch(`${API}/api/profiles/${normalized}/studio-theme`, {method:"PUT",headers:{"Content-Type":"application/json","Authorization":`Bearer ${ownerToken}`},body:JSON.stringify({theme}),cache:"no-store"});
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(result.error || `Falha HTTP ${response.status}`);
      toast("Tema exclusivo salvo no perfil.");
      applyPreview();
    } catch(error) { toast(error.message); }
  }
  $("saveProfileTheme").addEventListener("click", saveProfileTheme);
  document.querySelectorAll("[data-theme]").forEach(input=>input.addEventListener("input",()=>{
    const theme=Object.fromEntries([...document.querySelectorAll("[data-theme]")].map(x=>[x.dataset.theme,x.value]));
    try{$("profilePreview").contentWindow?.postMessage({type:"HATTZ_STUDIO_THEME_PREVIEW",theme},location.origin);}catch{}
  }));
  async function loadCatalog(){
    const root=$("badgeCatalog");
    if(!API){root.innerHTML='<p class="muted">API não configurada. O catálogo remoto não pode ser consultado.</p>';return;}
    try {
      const response=await fetch(`${API}/api/catalog`,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      const publicCode=localStorage.getItem(`hattz-share-code:${profileId}`)||"";
      const normalized=window.HATTZ_CORE?.normalizeCode?.(publicCode);
      let info={badges:[],frames:[]};
      if(normalized){try{const ent=await fetch(`${API}/api/profiles/${normalized}/entitlements`,{cache:"no-store"});if(ent.ok)info=await ent.json();}catch{}}
      const ownedFrames=new Set((info.frames||[]).map(x=>x.id));
      const customFrames=(data.frames||[]).filter(x=>ownedFrames.has(x.id)&&x.asset_json).map(x=>{let a={};try{a=JSON.parse(x.asset_json)||{};}catch{}return {...x,asset:a};});
      const grid=document.querySelector(".frame-grid");
      customFrames.forEach(frame=>{if(!grid.querySelector(`[data-frame="${CSS.escape(frame.id)}"]`)){const btn=document.createElement("button");btn.className="frame-option";btn.dataset.frame=frame.id;btn.innerHTML=`<span class="frame-preview">PNG</span><b>${escapeText(frame.name)}</b><small>${escapeText(frame.rarityLabel||"Exclusiva")}</small>`;grid.append(btn);btn.addEventListener("click",()=>{profile.moldura=frame.id;document.querySelectorAll("[data-frame]").forEach(x=>x.classList.toggle("selected",x===btn));save(false);});}});
      const amethystButton=document.querySelector('[data-frame="amethyst"]');
      if(amethystButton){const owned=ownedFrames.has("amethyst");amethystButton.disabled=!owned;amethystButton.title=owned?"Moldura concedida ao perfil":"Disponível após concessão administrativa no Hättz Control";}
      document.querySelectorAll("[data-frame]").forEach(btn=>btn.classList.toggle("selected",btn.dataset.frame===(profile.moldura||"none")));
      const earned=new Map((info.badges||[]).map(x=>[x.id,x]));
      root.innerHTML=(data.badges||[]).map(b=>{
        const award=earned.get(b.id);
        const date=award?.awarded_at?new Date(award.awarded_at).toLocaleDateString("pt-BR"):"";
        const iconValue=String(b.icon||"✦");const icon=/^data:image\/png;base64,/i.test(iconValue)||/^https:\/\//i.test(iconValue)||/^assets\//i.test(iconValue)?`<img src="${escapeText(iconValue)}" alt="" style="width:28px;height:28px;object-fit:contain;vertical-align:middle">`:escapeText(iconValue);
        const state = award ? " · CONQUISTADA" : b.award_mode === "automatic" ? " · REQUISITOS PENDENTES" : " · CONCESSÃO MANUAL";
        return `<div class="catalog-item" style="--badge-color:${escapeText(b.color||"#B8BCC8")};border-color:${escapeText(b.color||"#B8BCC8")}55"><strong>${icon} ${escapeText(b.name)}</strong><small>${escapeText(b.rarityLabel||b.rarity)} · ${escapeText(b.category)}${state}</small><p class="muted">${escapeText(b.description)}</p>${award?`<small>Obtida em ${date||"data indisponível"}</small>`:""}</div>`;
      }).join("")||'<p class="muted">Nenhuma insígnia publicada.</p>';
    } catch(error){root.textContent=`Não foi possível carregar o catálogo: ${error.message}`;}
  }
  function escapeText(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  $("reloadCatalog").addEventListener("click",loadCatalog);
  renderGlass();renderAvatar();renderCard();loadCatalog();loadThemeAccess();
})();
