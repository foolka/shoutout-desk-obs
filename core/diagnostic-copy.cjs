const words={
  'ru-RU':{
    title:'Диагностика',send:'Отправить логи',period:'Период отчёта',hour:'Последний час',day:'24 часа',week:'7 дней',cancel:'Отмена',
    help:'Отправка только с подтверждением. Ник канала, версия, состояние подключения и события очереди. Без токенов, текстов чата и списка людей; ники в событиях заменяются идентификаторами. Просмотр только владельцем fermionaplay.win, хранение 30 дней.',
    confirm:'Отправить отчёт на fermionaplay.win?\nКанал: %1\nПериод: %2 ч\nСобытий: %3\n\nНик канала, версия, состояние и обезличенные события очереди. Без токенов, чата и базы людей. Доступ только владельцу сайта, хранение 30 дней. Подробные журналы доступны только с момента обновления; более ранняя история может быть неполной.',
    busy:'Подготовка / отправка отчёта…',sent:'Отчёт отправлен. Номер можно скопировать:',
    error:'Не удалось отправить отчёт. Данные приложения не изменены. Проверьте интернет и повторите позже.',
    channel_required:'Сначала настройте канал Twitch. Не удалось определить ник для отчёта.',
    rate_limited:'Слишком много отчётов. Повторите через час.',
    unavailable:'Средство диагностики недоступно. Переустановите актуальную версию приложения; база сохранится.',
    copy:'Скопировать номер отчёта',copied:'Номер отчёта скопирован',
  },
  'uk-UA':{
    title:'Діагностика',send:'Надіслати логи',period:'Період звіту',hour:'Остання година',day:'24 години',week:'7 днів',cancel:'Скасувати',
    help:'Надсилання лише після підтвердження. Нік каналу, версія, стан з’єднання та події черги. Без токенів, текстів чату та списку людей; ніки в подіях замінюються ідентифікаторами. Перегляд лише власником fermionaplay.win, зберігання 30 днів.',
    confirm:'Надіслати звіт на fermionaplay.win?\nКанал: %1\nПеріод: %2 год\nПодій: %3\n\nНік каналу, версія, стан та знеособлені події черги. Без токенів, чату та бази людей. Доступ лише власнику сайту, зберігання 30 днів. Докладні журнали доступні лише з моменту оновлення; попередня історія може бути неповною.',
    busy:'Підготовка / надсилання звіту…',sent:'Звіт надіслано. Номер можна скопіювати:',
    error:'Не вдалося надіслати звіт. Дані застосунку не змінені. Перевірте інтернет і повторіть пізніше.',
    channel_required:'Спочатку налаштуйте канал Twitch. Не вдалося визначити нік для звіту.',
    rate_limited:'Забагато звітів. Повторіть за годину.',
    unavailable:'Засіб діагностики недоступний. Перевстановіть актуальну версію застосунку; база збережеться.',
    copy:'Скопіювати номер звіту',copied:'Номер звіту скопійовано',
  },
  'en-US':{
    title:'Diagnostics',send:'Send logs',period:'Report period',hour:'Last hour',day:'24 hours',week:'7 days',cancel:'Cancel',
    help:'Sent only after confirmation. Channel name, version, connection state and queue events. No tokens, chat text or people list; event usernames are replaced with identifiers. Only the fermionaplay.win owner can view reports, retained for 30 days.',
    confirm:'Send this report to fermionaplay.win?\nChannel: %1\nPeriod: %2 hours\nEvents: %3\n\nChannel name, version, state and pseudonymous queue events. No tokens, chat or people database. Only the site owner has access; retained for 30 days. Detailed logs start with this update; earlier history may be incomplete.',
    busy:'Preparing / sending report…',sent:'Report sent. You can copy its reference:',
    error:'Could not send the report. App data is unchanged. Check your connection and try again later.',
    channel_required:'Set up your Twitch channel first. No channel name is available for this report.',
    rate_limited:'Too many reports. Try again in an hour.',
    unavailable:'Diagnostics are unavailable. Reinstall the latest app version; your database is preserved.',
    copy:'Copy report reference',copied:'Report reference copied',
  }
};
module.exports=words;
