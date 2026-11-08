const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {style}=require('../core/badges/config.cjs');
const template=require('../core/badges/web/custom-template.js');

test('custom templates are bounded, additive and independent from preset palettes',()=>{
	const previous=style({design:'ticket',palettes:{ticket:{textColor:'#112233'}},customHtml:'<div>{{name}}</div>',customCss:'.badge {color:red}'});
	assert.equal(style({design:'custom'},previous).customHtml,previous.customHtml);
	assert.equal(style({design:'air'},previous).customCss,previous.customCss);
	assert.equal(style({font:'Arial'},previous).palettes.ticket.textColor,'#112233');
	assert.equal(style({customHtml:'',customCss:''}).customHtml,'');
	for(const key of ['customHtml','customCss']){
		assert.equal(style({[key]:'x'.repeat(32768)})[key].length,32768);
		for(const value of [null,5,{},'x'.repeat(32769),'a\0b'])assert.throws(()=>style({[key]:value}));
	}
	assert.equal(style({radius:33}).customHtml,template.html);
});

test('saving custom code preserves descriptions, people, history and stable source URL',async t=>{
	const store=new Store(':memory:');store.rememberAccount('123','owner');store.add('alice');store.add('bob');
	const service=new Badges({store,account:()=> '123',port:0});
	t.after(()=>{service.close();store.close();});
	service.save({account:'123',login:'bob',person:{enabled:true,custom:true,description:'Keep my description',style:{design:'sticker'}}});
	const bob=service.rule('bob'),people=store.people('123'),history=store.history('123'),token=service.overlayToken;
	service.save({account:'123',enabled:true,style:{design:'custom',customHtml:'<div>{{name}}</div>',customCss:'.badge {color:red}'}});
	service.save({account:'123',login:'alice',person:{enabled:true,custom:true,description:'Alice',style:{design:'custom',customHtml:'<div>{{description}}</div>',customCss:''}}});
	const reopened=new Badges({store,account:()=> '123'});t.after(()=>reopened.close());
	assert.equal(reopened.config().style.customHtml,'<div>{{name}}</div>');
	assert.equal(reopened.rule('alice').style.customHtml,'<div>{{description}}</div>');
	assert.deepEqual(reopened.rule('bob'),bob);assert.deepEqual(store.people('123'),people);assert.deepEqual(store.history('123'),history);assert.equal(reopened.overlayToken,token);
	await service.start();
	const response=await fetch(service.origin+'/api/config',{method:'POST',headers:{Authorization:'Bearer '+service.adminToken,'Content-Type':'application/json'},body:JSON.stringify({account:'123',enabled:true,style:{customHtml:'Ж'.repeat(32768),customCss:'x'.repeat(32768)}})});
	assert.equal(response.status,200);assert.equal(service.config().style.customHtml.length,32768);
});

test('AI prompt documents every supported variable and rendering restrictions',()=>{
	const prompt=template.prompt('Красный комикс');
	for(const [key] of template.variables)assert(prompt.includes('{{'+key+'}}'));
	for(const word of ['Красный комикс','560','JavaScript','CSS','32768','data-hide-empty'])assert(prompt.includes(word));
});
