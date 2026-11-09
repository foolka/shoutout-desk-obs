const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../core/store.cjs');
const { Badges } = require('../core/badges/service.cjs');
const { DESIGNS } = require('../core/badges/config.cjs');
const id = '00000000-0000-4000-8000-000000000001';

// Keep time, identity and data isolated from real OBS and Twitch.
function fixture(t) {
	let now = 1900000000000;
	const store = new Store(':memory:', () => now);
	store.rememberAccount('owner', 'owner'); store.add('alice');
	const service = new Badges({ store, account: () => 'owner', now: () => now, port: 0 });
	t.after(() => { service.close(); store.close(); });
	return { service, store, advance: ms => now += ms };
}

test('every badge design waits for a recent compatible renderer', async t => {
	const { service, advance } = fixture(t);
	for (const { id: design } of DESIGNS) {
		service.clients.clear(); service.current = null;
		service.save({ account: 'owner', enabled: true, style: { design } });
		await service.test('alice'); advance(30000);
		assert.equal(service.frame().event, null);
		assert.equal(service.queue.length, 1);
		service.observe(id, service.build, 'Chrome/150');
		const frame = service.frame();
		assert.equal(frame.event.style.design, design);
		assert.equal(frame.event.startsAt, frame.now);
		assert.equal(service.info().obsClients, 0);
		service.observe(id, service.build, 'OBSStudio/32.2.2');
		assert.equal(service.info().obsClients, 1);
		advance(12001);
		assert.equal(service.info().obsClients, 0);
	}
});

test('outdated and disconnected sources cannot start fresh queued badges', async t => {
	const { service, advance } = fixture(t);
	await service.test('alice');
	service.observe(id, '0'.repeat(64), 'obs-browser');
	assert.equal(service.frame().event, null);
	assert.equal(service.info().outdated, true);
	service.observe(id, service.build, 'obs-browser');
	assert.ok(service.frame().event);
	advance(20000);
	await service.test('alice');
	assert.equal(service.frame().event, null);
	assert.equal(service.queue.length, 1);
	service.observe(id, service.build, 'obs-browser');
	assert.ok(service.frame().event);
});

test('stale waiting events expire and do not exhaust the test queue', async t => {
	const { service, advance } = fixture(t);
	for (let i = 0; i < 5; i++) await service.test('alice');
	await assert.rejects(() => service.test('alice'));
	advance(121000);
	await service.test('alice');
	assert.equal(service.queue.length, 1);
	service.observe(id, service.build, 'obs-browser');
	assert.equal(service.frame().event.login, 'alice');
});

test('HTTP heartbeats preserve profiles and withhold active events from outdated pages', async t => {
	const { service, store, advance } = fixture(t);
	await service.start();
	const url = service.info().url, token = service.overlayToken;
	const saved = JSON.stringify({ config: service.config(), history: store.history('owner') });
	const poll = build => fetch(service.origin + '/api/view/' + token + '?' + new URLSearchParams({ client: id, build }), { headers: { 'User-Agent': 'obs-browser/2.26' } }).then(r => r.json());
	await service.test('alice');
	assert.equal((await poll('0'.repeat(64))).event, null);
	assert.equal(service.queue.length, 1);
	const active = await poll(service.build);
	assert.equal(active.event.login, 'alice');
	assert.equal((await poll('0'.repeat(64))).event, null);
	assert.equal(service.current.id, active.event.id);
	advance(12001);
	assert.equal(service.info().obsClients, 0);
	assert.equal(service.info().url, url);
	assert.equal(store.meta('badges:overlayToken'), token);
	assert.equal(JSON.stringify({ config: service.config(), history: store.history('owner') }), saved);
});

test('heartbeat registry rejects malformed input and stays bounded', t => {
	const { service, advance } = fixture(t);
	service.observe('bad', service.build, 'obs-browser');
	assert.equal(service.clients.size, 0);
	for (let i = 0; i < 40; i++) service.observe(i.toString(16).padStart(36, '0'), service.build, 'obs-browser');
	assert.equal(service.clients.size, 32);
	advance(12001);
	assert.equal(service.info().clients, 0);
});
