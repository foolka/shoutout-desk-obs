(() => {
	const images = new Map();
	const revisions = new WeakMap();
	// Only Twitch avatars and embedded raster images can leave the inert template.
	function safeImage(value) {
		if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' && url.hostname === 'static-cdn.jtvnw.net' && !url.username && !url.password ? url.href : '';
		} catch { return ''; }
	}
	// Substitute DOM text, never concatenate viewer content into HTML or CSS.
	function documentFor(data) {
		const style = data.style;
		const login = String(data.login || 'streamer');
		const name = String(data.name || login);
		const values = {
			login, name, avatar: String(data.avatar || '').startsWith('data:') ? safeImage(data.avatar) : '',
			initial: Array.from(name)[0]?.toUpperCase() || '?',
			description: String(data.description || '').trim(),
			url: 'https://www.twitch.tv/' + encodeURIComponent(login),
			stamp: style.stampEnabled ? String(style.stampText || '') : ''
		};
		const replace = text => text.replace(/\{\{([a-z]+)\}\}/g, (token, key) => Object.hasOwn(values, key) ? values[key] : token);
		const fragment = DOMPurify.sanitize(style.customHtml ?? BadgeTemplate.html, {
			USE_PROFILES: {html: true},
			FORCE_BODY: true,
			ADD_TAGS: ['style'],
			FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'track'],
			FORBID_ATTR: ['href', 'srcset', 'action', 'formaction', 'target', 'ping', 'autofocus', 'is'],
			RETURN_DOM_FRAGMENT: true
		});
		const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			if (walker.currentNode.parentElement?.tagName !== 'STYLE') walker.currentNode.textContent = replace(walker.currentNode.textContent);
		}
		for (const element of fragment.querySelectorAll('*')) {
			for (const attribute of ['title', 'alt']) {
				if (element.hasAttribute(attribute)) element.setAttribute(attribute, replace(element.getAttribute(attribute)));
			}
			const emptyKey = element.getAttribute('data-hide-empty');
			if (Object.hasOwn(values, emptyKey) && !values[emptyKey]) { element.remove(); continue; }
			if (element.hasAttribute('src')) {
				const original = element.getAttribute('src');
				const src = element.tagName === 'IMG' ? safeImage(original === '{{avatar}}' ? values.avatar : original) : '';
				if (src) { element.setAttribute('src', src); element.setAttribute('referrerpolicy', 'no-referrer'); }
				else element.removeAttribute('src');
			}
		}
		const container = document.createElement('template');
		container.content.append(fragment);
		// A raw closing style tag must not turn the separate CSS field into markup.
		const css = String(style.customCss ?? BadgeTemplate.css).replace(/</g, '\\3c ');
		return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<style>html,body{margin:0;width:560px;height:560px;overflow:hidden;background:transparent}*{box-sizing:border-box}body{font-family:'Segoe UI',sans-serif}a{pointer-events:none}</style>
<style>${css}</style></head><body>${container.innerHTML}</body></html>`;
	}
	// Fetch only the validated Twitch avatar outside the opaque sandbox, once per URL.
	function avatarData(url) {
		if (!url || !safeImage(url)) return Promise.resolve('');
		if (url.startsWith('data:')) return Promise.resolve(url);
		const cached = images.get(url);
		if (cached && cached.until > Date.now()) return cached.promise;
		if (images.size >= 32) images.delete(images.keys().next().value);
		const entry = {value: '', until: Date.now() + 60000};
		entry.promise = (async () => {
			try {
				const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(4000)});
				const type = (response.headers.get('content-type') || '').split(';')[0];
				if (!response.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return '';
				const reader = response.body.getReader(), chunks = [];
				let size = 0;
				for (;;) {
					const {done, value} = await reader.read();
					if (done) break;
					size += value.length;
					if (size > 2097152) { await reader.cancel(); return ''; }
					chunks.push(value);
				}
				const encoded = await new Promise((resolve, reject) => {
					const file = new FileReader();file.onload = () => resolve(file.result);file.onerror = reject;
					file.readAsDataURL(new Blob(chunks, {type}));
				});
				entry.value = encoded;entry.until = Date.now() + 3600000;return encoded;
			} catch { return ''; }
		})();
		images.set(url, entry);return entry.promise;
	}

	// Ignore delayed image responses after the editor switches to a different person or design.
	function render(frame, data) {
		const revision = (revisions.get(frame) || 0) + 1;revisions.set(frame, revision);
		const avatar = data.avatar || '';
		const immediate = avatar.startsWith('data:') ? safeImage(avatar) : images.get(avatar)?.value || '';
		frame.srcdoc = documentFor({...data, avatar: immediate});
		if (!immediate && avatar) void avatarData(avatar).then(value => {
			if (value && revisions.get(frame) === revision && !frame.hidden) frame.srcdoc = documentFor({...data, avatar: value});
		});
	}
	window.CustomBadge = {documentFor, render};
})();
