/*
 * MDAC (Malaysia Digital Arrival Card) autofill.
 * https://imigresen-online.imi.gov.my/mdac/main?registerMain
 *
 * This file holds no personal data. The caller defines a global `MDAC` object
 * with the traveller's details (see mdac.html) and then runs this script:
 *   - iOS Shortcut: "Run JavaScript on Web Page" with `var MDAC = {...};` + this file
 *   - Bookmarklet: sets window.MDAC and loads this file as a <script>
 * Nothing is sent anywhere; it only sets values on the open MDAC form.
 * The slider captcha and Submit are left to the user.
 */
(function (data) {
	var inShortcut = typeof completion === 'function';
	function done(msg) {
		if (inShortcut) completion(msg);
		else if (msg) alert(msg);
	}

	if (!document.getElementById('passNo') || !document.getElementById('nationality')) {
		return done('This is not the MDAC registration page. Open imigresen-online.imi.gov.my/mdac/main?registerMain first.');
	}
	if (!data || typeof data !== 'object') {
		return done('No traveller data found (MDAC is not defined).');
	}

	var filled = [];
	var missing = [];

	function el(id) { return document.getElementById(id); }
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	function fire(node, type) { node.dispatchEvent(new Event(type, { bubbles: true })); }

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function today(offsetDays) {
		var d = new Date();
		d.setDate(d.getDate() + (offsetDays || 0));
		return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
	}
	// Accepts DD/MM/YYYY, D/M/YYYY or YYYY-MM-DD; returns DD/MM/YYYY.
	function toDmy(v) {
		if (!v) return '';
		v = String(v).trim();
		var m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
		if (m) return pad(+m[3]) + '/' + pad(+m[2]) + '/' + m[1];
		m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
		if (m) return pad(+m[1]) + '/' + pad(+m[2]) + '/' + m[3];
		return v;
	}

	function setText(id, value, label) {
		var node = el(id);
		if (!node) return;
		if (value === undefined || value === null || String(value).trim() === '') {
			missing.push(label);
			return;
		}
		node.value = String(value);
		fire(node, 'input');
		fire(node, 'change');
		node.style.background = '';
		filled.push(label);
	}

	// Picks an option by value, then by exact text, then by text containing the wanted value.
	function setSelect(id, wanted, label, silent) {
		var node = el(id);
		if (!node) return false;
		if (wanted === undefined || wanted === null || String(wanted).trim() === '') {
			missing.push(label);
			return false;
		}
		var w = String(wanted).trim().toUpperCase();
		var opts = Array.prototype.slice.call(node.options).filter(function (o) { return o.value !== ''; });
		function text(o) { return o.text.replace(/\s+/g, ' ').trim().toUpperCase(); }
		var match = opts.filter(function (o) { return o.value.toUpperCase() === w; })[0]
			|| opts.filter(function (o) { return text(o) === w; })[0]
			|| opts.filter(function (o) { return text(o).indexOf(w) !== -1; })[0];
		if (!match) {
			missing.push(label + ' ("' + wanted + '" not in list)');
			return false;
		}
		node.value = match.value;
		if (!silent) fire(node, 'change');
		filled.push(label);
		return true;
	}

	// Some selects are refilled over AJAX after another field changes
	// ($('.region').html(data) etc). Tag the current options, trigger the change,
	// then wait until the tagged options are gone.
	function markOptions(id) {
		var node = el(id);
		if (node) Array.prototype.forEach.call(node.options, function (o) { o.setAttribute('data-mdac-old', '1'); });
	}
	async function waitForReload(id, timeoutMs) {
		var node = el(id);
		var end = Date.now() + (timeoutMs || 6000);
		while (Date.now() < end) {
			if (node && !node.querySelector('[data-mdac-old]') && node.options.length > 1) return true;
			await sleep(150);
		}
		return false;
	}

	(async function () {
		var nationality = data.nationality;

		// Personal details
		setText('name', String(data.name || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim(), 'Name');
		setText('passNo', String(data.passNo || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), 'Passport no.');

		// Nationality refills the phone-code list and decides whether the accommodation block shows.
		// Country of birth has the same onchange handlers, so set it silently to avoid a second,
		// racing phone-code reload.
		setSelect('pob', data.pob || nationality, 'Country of birth', true);
		markOptions('region');
		var natSet = setSelect('nationality', nationality, 'Nationality');
		setSelect('sex', data.sex, 'Sex');
		setText('dob', toDmy(data.dob), 'Date of birth');
		setText('passExpDte', toDmy(data.passExpDte), 'Passport expiry');

		// Contact
		setText('email', data.email, 'Email');
		setText('confirmEmail', data.email, 'Confirm email');
		if (natSet) await waitForReload('region');
		setSelect('region', data.region, 'Phone country code');
		// Drop a "+<country code>" prefix; the form takes the code separately.
		var mobile = String(data.mobile || '').trim();
		if (mobile.charAt(0) === '+' && data.region) mobile = mobile.replace(new RegExp('^\\+\\s*' + String(data.region).replace(/\D/g, '')), '');
		setText('mobile', mobile.replace(/\D/g, ''), 'Mobile');

		// Trip. The arrival date must be between today and 2 days from today.
		var arr = toDmy(data.arrDt);
		var dep = toDmy(data.depDt);
		if (!arr && !inShortcut) arr = prompt('Arrival date in Malaysia (DD/MM/YYYY)', today(0)) || '';
		if (!dep && !inShortcut) dep = prompt('Departure date from Malaysia (DD/MM/YYYY)', arr || today(0)) || '';
		setText('arrDt', toDmy(arr), 'Arrival date');
		setText('depDt', toDmy(dep), 'Departure date');
		setSelect('trvlMode', data.trvlMode, 'Mode of travel');
		setSelect('embark', data.embark, 'Last port of embarkation');
		setText('vesselNm', String(data.vesselNm || '').toUpperCase(), 'Flight / vehicle no.');

		// Accommodation (the form only shows this block for some nationalities)
		var accom = el('formAccommodation');
		if (accom && accom.style.display !== 'none') {
			setSelect('accommodationStay', data.accommodationStay, 'Accommodation type');
			setText('accommodationAddress1', String(data.accommodationAddress1 || '').toUpperCase(), 'Address line 1');
			if (data.accommodationAddress2) setText('accommodationAddress2', String(data.accommodationAddress2).toUpperCase(), 'Address line 2');
			markOptions('accommodationCity');
			if (setSelect('accommodationState', data.state, 'State')) {
				await waitForReload('accommodationCity');
				setSelect('accommodationCity', data.city, 'City');
			} else {
				missing.push('City');
			}
			setText('accommodationPostcode', data.postcode, 'Postcode');
		}

		var captcha = el('captcha');
		if (captcha && captcha.scrollIntoView) captcha.scrollIntoView({ behavior: 'smooth', block: 'center' });

		var msg = 'MDAC: filled ' + filled.length + ' fields for ' + (data.name || 'traveller') + '.';
		if (missing.length) msg += '\nPlease check: ' + missing.join(', ') + '.';
		msg += '\nReview the form, solve the slider puzzle, then tap Submit.';
		done(msg);
	})().catch(function (err) {
		done('MDAC autofill failed: ' + (err && err.message ? err.message : err));
	});
})(typeof MDAC !== 'undefined' ? MDAC : window.MDAC);
