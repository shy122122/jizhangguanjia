(function(global){
  'use strict';
  var KEY='mz-admin-session';
  function session(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
  function setSession(value){if(value)sessionStorage.setItem(KEY,JSON.stringify(value));else sessionStorage.removeItem(KEY);}
  function query(params){var q=new URLSearchParams();Object.keys(params||{}).forEach(function(k){var v=params[k];if(v!==''&&v!=null)q.set(k,v);});var s=q.toString();return s?'?'+s:'';}
  async function request(method,path,options){
    options=options||{};var current=session();var headers=Object.assign({},options.headers||{});
    if(current&&current.token)headers.Authorization='Bearer '+current.token;
    if(options.body!==undefined)headers['Content-Type']='application/json';
    var response=await fetch('/api/admin'+path,{method:method,headers:headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
    var renewed=response.headers.get('X-Refreshed-Token');if(renewed&&current){current.token=renewed;setSession(current);}
    var json=null;try{json=await response.json();}catch{}
    if(!response.ok||!json||json.ok!==true){var err=new Error(json&&json.error&&json.error.message||'服务响应异常');err.status=response.status;err.code=json&&json.error&&json.error.code;err.details=json&&json.error&&json.error.details;if(response.status===401&&!options.keepSession){setSession(null);global.dispatchEvent(new CustomEvent('admin:unauthorized'));}throw err;}
    return options.raw?json:json.data;
  }
  async function download(path,filename){var current=session();var response=await fetch('/api/admin'+path,{headers:current&&current.token?{Authorization:'Bearer '+current.token}:{}});if(!response.ok){var json;try{json=await response.json();}catch{}throw new Error(json&&json.error&&json.error.message||'下载失败');}var blob=await response.blob();var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  global.AdminAPI={session:session,setSession:setSession,query:query,get:function(p,q,o){return request('GET',p+query(q),o);},post:function(p,b,o){return request('POST',p,Object.assign({body:b},o));},put:function(p,b,o){return request('PUT',p,Object.assign({body:b},o));},del:function(p,b,o){return request('DELETE',p,Object.assign({body:b},o));},download:download};
})(window);
