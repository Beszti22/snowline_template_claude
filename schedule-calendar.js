/* Snowline — "Az évünk" / "Our year" schedule, live from the club's public Google Calendar.
   Falls back silently to the static rows already in schedule.html if the fetch fails
   (network issue, quota, misconfigured key, etc.) — nothing is ever left blank/broken. */
(function () {
  var CALENDAR_ID = 'snowline.web@gmail.com';
  var API_KEY = 'AIzaSyDyMO1OLfNdkLF-PwsgxijvEOdP1D643CQ';
  var MAX_RESULTS = 4;
  var PUBLIC_CALENDAR_URL = 'https://calendar.google.com/calendar/embed?src=snowline.web%40gmail.com&ctz=Europe%2FBudapest';

  var listEl = document.getElementById('scheduleList');
  if (!listEl) return;

  var HU_MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
  var EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Pick these colors in the Google Calendar event editor to control the category badge.
  var CATEGORY_MAP = {
    '11': { hu: 'IFI VERSENY', en: 'Youth race', cls: 'tag-race' },        // Tomato (red)
    '10': { hu: 'SERDÜLŐ VERSENY', en: 'Junior race', cls: 'tag-junior' }, // Basil (green)
    '9': { hu: 'EDZÉS', en: 'Training', cls: 'tag-training' },             // Blueberry (blue)
    '5': { hu: 'UTAZÁS', en: 'Travel', cls: 'tag-travel' },                // Banana (lemon yellow)
    '8': { hu: 'PIHENŐ', en: 'Rest', cls: 'tag-event' }                    // Graphite (grey)
  };
  var DEFAULT_CATEGORY = { hu: 'ESEMÉNY', en: 'Event', cls: 'tag-event' };

  var TEXT = {
    hu: { calLink: 'Teljes naptár megnyitása', empty: 'Jelenleg nincs meghirdetett közelgő program.' },
    en: { calLink: 'Open full calendar', empty: 'No upcoming events are scheduled right now.' }
  };

  var currentLang = document.documentElement.lang === 'en' ? 'en' : 'hu';
  var renderedEvents = null;

  function parseDate(part) {
    return part.date ? new Date(part.date + 'T00:00:00') : new Date(part.dateTime);
  }

  function extractOverride(description) {
    if (!description) return null;
    var m = description.match(/c[íi]mke:\s*(.+)/i);
    return m ? m[1].trim() : null;
  }

  function computeLabel(startPart, endPart) {
    var start = parseDate(startPart);
    var end = parseDate(endPart);
    if (endPart.date) { end = new Date(end.getTime() - 24 * 60 * 60 * 1000); } // all-day end is exclusive

    var sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
    if (sameDay) {
      return {
        hu: HU_MONTHS[start.getMonth()] + ' ' + start.getDate() + '.',
        en: EN_MONTHS[start.getMonth()] + ' ' + start.getDate()
      };
    }
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return {
        hu: HU_MONTHS[start.getMonth()] + ' ' + start.getDate() + '\u2013' + end.getDate() + '.',
        en: EN_MONTHS[start.getMonth()] + ' ' + start.getDate() + '\u2013' + end.getDate()
      };
    }
    return {
      hu: HU_MONTHS[start.getMonth()] + ' ' + start.getDate() + '\u2013' + HU_MONTHS[end.getMonth()] + ' ' + end.getDate() + '.',
      en: EN_MONTHS[start.getMonth()] + ' ' + start.getDate() + '\u2013' + EN_MONTHS[end.getMonth()] + ' ' + end.getDate()
    };
  }

  function buildRow(ev) {
    var category = CATEGORY_MAP[ev.colorId] || DEFAULT_CATEGORY;
    var override = extractOverride(ev.description);
    var label = override ? { hu: override, en: override } : computeLabel(ev.start, ev.end);

    var row = document.createElement('div');
    row.className = 'schedule-row reveal in-view';

    var badge = document.createElement('div');
    badge.className = 'date-badge';
    var badgeSpan = document.createElement('span');
    badgeSpan.textContent = label[currentLang];
    badge.appendChild(badgeSpan);

    var info = document.createElement('div');
    info.className = 'schedule-info';
    var h4 = document.createElement('h4');
    h4.textContent = ev.summary || '';
    info.appendChild(h4);
    if (ev.location) {
      var loc = document.createElement('span');
      loc.textContent = ev.location;
      info.appendChild(loc);
    }

    var tag = document.createElement('span');
    tag.className = 'tag ' + category.cls;
    tag.textContent = category[currentLang];

    row.appendChild(badge);
    row.appendChild(info);
    row.appendChild(tag);
    return row;
  }

  function render() {
    listEl.innerHTML = '';
    if (!renderedEvents || !renderedEvents.length) {
      var empty = document.createElement('p');
      empty.className = 'schedule-empty';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--color-text-muted)';
      empty.style.padding = '32px 0';
      empty.style.fontSize = '14px';
      empty.textContent = TEXT[currentLang].empty;
      listEl.appendChild(empty);
      return;
    }
    renderedEvents.forEach(function (ev) { listEl.appendChild(buildRow(ev)); });
  }

  function ensureCalendarLink() {
    if (document.getElementById('scheduleCalLink')) return;
    var lead = document.querySelector('.schedule .section-head');
    if (!lead) return;
    var link = document.createElement('a');
    link.id = 'scheduleCalLink';
    link.href = PUBLIC_CALENDAR_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'btn btn-outline';
    link.style.marginTop = '16px';
    link.textContent = TEXT[currentLang].calLink;
    lead.appendChild(link);
  }

  function relabel(lang) {
    currentLang = lang === 'en' ? 'en' : 'hu';
    var link = document.getElementById('scheduleCalLink');
    if (link) link.textContent = TEXT[currentLang].calLink;
    if (renderedEvents) render();
  }

  // Piggyback on the existing HU/EN buttons without touching i18n.js.
  var btnHu = document.getElementById('btnHu');
  var btnEn = document.getElementById('btnEn');
  if (btnHu) btnHu.addEventListener('click', function () { relabel('hu'); });
  if (btnEn) btnEn.addEventListener('click', function () { relabel('en'); });

  ensureCalendarLink();

  var timeMin = new Date();
  timeMin.setHours(0, 0, 0, 0);

  var url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(CALENDAR_ID) + '/events'
    + '?key=' + API_KEY
    + '&singleEvents=true'
    + '&orderBy=startTime'
    + '&maxResults=' + MAX_RESULTS
    + '&timeMin=' + encodeURIComponent(timeMin.toISOString());

  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('Calendar API responded with ' + res.status);
      return res.json();
    })
    .then(function (data) {
      renderedEvents = data.items || [];
      render();
    })
    .catch(function (err) {
      // Leave the static fallback rows already in schedule.html untouched.
      console.warn('Snowline: live schedule could not be loaded, showing static fallback.', err);
    });
})();
