(() => {
	const variables = [
		['name', 'Отображаемое имя', 'Имя Twitch, до 40 символов; при отсутствии используется логин.'],
		['login', 'Ник', 'Логин Twitch без @.'],
		['avatar', 'Аватар', 'Адрес изображения Twitch. Только для src у img; может быть пустым.'],
		['initial', 'Первая буква', 'Замена аватару, если изображения нет.'],
		['description', 'Описание', 'Твоё описание стримера, до 140 символов; может быть пустым.'],
		['url', 'Адрес канала', 'https://www.twitch.tv/ник, как текст, без перехода по ссылке.'],
		['stamp', 'Текст штампа', 'Сохранённый текст штампа; пустой, если штамп выключен.']
	];
	const html = `<article class="badge">
	<div class="badge__identity">
		<div class="badge__portrait">
			<span class="badge__initial">{{initial}}</span>
			<img class="badge__avatar" src="{{avatar}}" alt="" data-hide-empty="avatar">
		</div>
		<div class="badge__heading">
			<div class="badge__label">ГОСТЬ ЭФИРА</div>
			<div class="badge__name">{{name}}</div>
			<div class="badge__login">@{{login}}</div>
		</div>
	</div>
	<div class="badge__description" data-hide-empty="description">{{description}}</div>
	<div class="badge__stamp" data-hide-empty="stamp">{{stamp}}</div>
</article>`;
	const css = `.badge {
	position: absolute;
	left: 40px;
	top: 140px;
	width: 480px;
	padding: 28px;
	border: 2px solid #252a29;
	border-radius: 8px;
	background: #ffffff;
	color: #252a29;
	box-shadow: 8px 8px 0 #84cbb5;
	font-family: "Segoe UI", sans-serif;
}
.badge__identity {
	display: flex;
	align-items: center;
	gap: 18px;
}
.badge__portrait {
	position: relative;
	flex: 0 0 80px;
	height: 80px;
	overflow: hidden;
	border-radius: 50%;
	background: #e6eeea;
}
.badge__initial {
	display: grid;
	place-items: center;
	height: 100%;
	font-size: 32px;
	font-weight: 700;
}
.badge__avatar {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.badge__heading {
	flex: 1;
	min-width: 0;
}
.badge__label {
	margin-bottom: 6px;
	color: #a63c46;
	font-size: 12px;
	font-weight: 700;
}
.badge__name {
	font-size: 26px;
	line-height: 1.15;
	font-weight: 800;
	overflow-wrap: anywhere;
}
.badge__login {
	margin-top: 6px;
	font-size: 14px;
	overflow-wrap: anywhere;
}
.badge__description {
	margin-top: 20px;
	padding-top: 16px;
	border-top: 1px solid #ccd8d1;
	font-size: 20px;
	line-height: 1.4;
	overflow-wrap: anywhere;
}
.badge__stamp {
	position: absolute;
	top: -20px;
	right: 16px;
	padding: 5px 10px;
	border: 3px double currentColor;
	color: #b93845;
	background: #ffffff;
	font-size: 18px;
	font-weight: 900;
	transform: rotate(-9deg);
}`;
	const limits = {customHtml: 32768, customCss: 32768};
	// Keep the copyable contract and the actual renderer's variable list together.
	function prompt(brief = '') {
		return `Создай бейджик автошотаута для Shoutout Desk / Shoutout Desk OBS.
Мой стиль и пожелания: ${brief.trim() || '[впиши палитру, настроение, шрифты и композицию]'}

Верни два отдельных блока кода: HTML-фрагмент и CSS. Без Markdown внутри кода, без html/head/body, JavaScript, библиотек, iframe, форм, видео и аудио. CSS можно также поместить в style внутри HTML. Холст строго 560 × 560 CSS px, прозрачный; всё за его границами обрезается. Учитывай отступы для теней, наклона и анимации. Бейджик показывается поверх стрима, это не страница сайта.

Доступные переменные (точный регистр):
${variables.map(([key, title, help]) => `{{${key}}} — ${title}. ${help}`).join('\n')}

Переменные подставляются как безопасный текст в HTML, а не как HTML-код. В атрибутах разрешены alt/title и src="{{avatar}}" у img. Не используй переменные в CSS, class, id, обработчиках или ссылках. Условия и циклы шаблонизатора не поддерживаются. Чтобы скрыть пустой элемент, укажи data-hide-empty="description" (также avatar или stamp). Для отсутствующего аватара размести {{initial}} под изображением.

Внешние ресурсы, @import, удалённые шрифты, сетевые запросы и JavaScript заблокированы. Используй системные шрифты, CSS и аватар Twitch. Допустимы встроенные data:image/png, jpeg, webp, gif. SVG не поддерживается. Ссылки не кликабельны.

Поддержи длинное имя (40 символов), логин и описание (140 символов), пустое описание и отсутствие аватара. Текст не должен выходить за рамки. Используй min-width:0, overflow-wrap и подходящую типографику. Все цвета, рамки, отступы и штамп оформляй в CSS; ползунки готовых тем здесь не применяются. Появление, уход и длительность задаёт приложение, не скрывай весь бейджик своим таймером. CSS-анимации допустимы, учти prefers-reduced-motion.
Лимит каждого поля: 32768 символов. Выведи только готовый HTML и CSS.`;
	}
	const contract = {variables, html, css, limits, prompt};
	if (typeof module !== 'undefined' && module.exports) module.exports = contract;
	else window.BadgeTemplate = contract;
})();
