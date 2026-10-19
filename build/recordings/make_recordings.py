#!/usr/bin/env python3
"""Make the Recorder's recordings: short excerpts of open-access PhysioNet databases, in the form the Recorder reads.

For each recording listed in recordings.json, this script downloads the source files it needs from PhysioNet (into a
cache, checking each file against the database's SHA256SUMS.txt), cuts out the excerpt, keeps the channels it names
(resampled or filtered only where recordings.json says so), takes the beats and annotations that go with it, and writes:

    recordings/<id>.bin    the samples: little-endian 16-bit integers, channel after channel; value = raw × scale + offset,
                           and -32768 marks a gap
    recordings/<id>.json   what the recording is: its channels, sampling rate, beats, rhythms and events, the person it
                           comes from (as the database describes them), its source, licence and citations
    recordings/index.json  the list of recordings, for the Recorder's list

Run:
    python3 build/recordings/make_recordings.py                # all of them
    python3 build/recordings/make_recordings.py ecg-normal rsa # some of them
    python3 build/recordings/make_recordings.py --preview rsa  # also draw a picture of each (needs matplotlib)
Options: --cache DIR (default ~/.cache/bms-workbench/physionet). Needs numpy, scipy and wfdb
(pip install numpy scipy wfdb)."""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request

import numpy as np
from scipy.signal import butter, resample_poly, sosfiltfilt
import wfdb
from wfdb import processing

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(SITE, 'recordings')
FILES = 'https://physionet.org/files/'
PHYSIONET_CITES = (
    'Goldberger AL, Amaral LAN, Glass L, Hausdorff JM, Ivanov PCh, Mark RG, Mietus JE, Moody GB, Peng C-K, Stanley HE. '
    'PhysioBank, PhysioToolkit, and PhysioNet: components of a new research resource for complex physiologic signals. '
    'Circulation 101(23):e215–e220 (2000). https://doi.org/10.1161/01.CIR.101.23.e215 – and, as PhysioNet now asks: '
    'Pollard T, Moody BE, Lehman L, et al. PhysioNet as a global platform for biomedical research. Nature Health (2026). '
    'https://doi.org/10.1038/s44360-026-00096-z')
ODC_BY = 'Open Data Commons Attribution License v1.0'

# the databases: their names, licences and the citations each asks for (from each project's page on PhysioNet)
DBS = {
    'mitdb': {'name': 'MIT-BIH Arrhythmia Database', 'version': '1.0.0', 'doi': '10.13026/C2F305',
              'cite_database': 'Moody G, Mark R. MIT-BIH Arrhythmia Database (version 1.0.0). PhysioNet (2005). https://doi.org/10.13026/C2F305',
              'cite_original': 'Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database. IEEE Eng in Med and Biol 20(3):45–50 (2001).'},
    'afdb': {'name': 'MIT-BIH Atrial Fibrillation Database', 'version': '1.0.0', 'doi': '10.13026/C2MW2D',
             'cite_database': 'Moody G, Mark R. MIT-BIH Atrial Fibrillation Database (version 1.0.0). PhysioNet (2000). https://doi.org/10.13026/C2MW2D',
             'cite_original': 'Moody GB, Mark RG. A new method for detecting atrial fibrillation using R-R intervals. Computers in Cardiology 10:227–230 (1983).'},
    'ptbdb': {'name': 'PTB Diagnostic ECG Database', 'version': '1.0.0', 'doi': '10.13026/C28C71',
              'cite_original': 'Bousseljot R, Kreiseler D, Schnabel A. Nutzung der EKG-Signaldatenbank CARDIODAT der PTB über das Internet. Biomedizinische Technik 40, Ergänzungsband 1, S 317 (1995).'},
    'challenge-2016': {'name': 'Classification of Heart Sound Recordings: the PhysioNet/Computing in Cardiology Challenge 2016', 'version': '1.0.0',
                       'cite_original': 'Liu C, Springer D, Li Q, et al. An open access database for the evaluation of heart sound algorithms. Physiol Meas 37(12):2181–2213 (2016). https://doi.org/10.1088/0967-3334/37/12/2181'},
    'prcp': {'name': 'Physiologic Response to Changes in Posture', 'version': '1.0.0', 'doi': '10.13026/C2PC7R',
             'cite_original': 'Heldt T, Oefinger MB, Hoshiyama M, Mark RG. Circulatory response to passive and active changes in posture. Computers in Cardiology 30:263–266 (2003).'},
    'bidmc': {'name': 'BIDMC PPG and Respiration Dataset', 'version': '1.0.0', 'doi': '10.13026/C2208R',
              'cite_original': 'Pimentel MAF, Johnson AEW, Charlton PH, et al. Towards a robust estimation of respiratory rate from pulse oximeters. IEEE Trans Biomed Eng 64(8):1914–1923 (2017). https://doi.org/10.1109/TBME.2016.2613124'},
    'fantasia': {'name': 'Fantasia Database', 'version': '1.0.0', 'doi': '10.13026/C2RG61',
                 'cite_original': 'Iyengar N, Peng C-K, Morin R, Goldberger AL, Lipsitz LA. Age-related alterations in the fractal scaling of cardiac interbeat interval dynamics. Am J Physiol 271:R1078–R1084 (1996).'},
    'wrist': {'name': 'Wrist PPG During Exercise', 'version': '1.0.0', 'doi': '10.13026/C2PQ1X',
              'cite_original': 'Jarchi D, Casson AJ. Description of a database containing wrist PPG signals recorded during physical exercise with both accelerometer and gyroscope measures of motion. Data 2(1):1 (2017). https://doi.org/10.3390/data2010001'},
    'emgdb': {'name': 'Examples of Electromyograms', 'version': '1.0.0', 'doi': '10.13026/C24S3D'},
    'eegmmidb': {'name': 'EEG Motor Movement/Imagery Dataset', 'version': '1.0.0', 'doi': '10.13026/C28G6P',
                 'cite_database': 'Schalk G. EEG Motor Movement/Imagery Dataset (version 1.0.0). PhysioNet (2009). https://doi.org/10.13026/C28G6P',
                 'cite_original': 'Schalk G, McFarland DJ, Hinterberger T, Birbaumer N, Wolpaw JR. BCI2000: a general-purpose brain-computer interface (BCI) system. IEEE Trans Biomed Eng 51(6):1034–1043 (2004).'},
}

# what the labels of the beats and rhythms mean (the MIT-BIH conventions)
BEAT_MEANING = {
    'N': 'normal beat: a normally conducted QRS (whatever the rhythm)', 'L': 'left bundle branch block beat', 'R': 'right bundle branch block beat',
    'A': 'atrial premature beat', 'a': 'aberrated atrial premature beat', 'J': 'junctional (nodal) premature beat',
    'S': 'supraventricular premature beat', 'V': 'premature ventricular contraction (ventricular ectopic beat)',
    'F': 'fusion of a ventricular and a normal beat', 'e': 'atrial escape beat', 'j': 'junctional (nodal) escape beat',
    'E': 'ventricular escape beat', '/': 'paced beat', 'f': 'fusion of a paced and a normal beat', 'Q': 'unclassifiable beat'}
RHYTHM_MEANING = {
    'N': 'Sinus rhythm', 'B': 'Ventricular bigeminy', 'T': 'Ventricular trigeminy', 'AFIB': 'Atrial fibrillation',
    'AFL': 'Atrial flutter', 'BII': '2:1 heart block (second degree)', 'BI': 'First-degree heart block',
    'SBR': 'Sinus bradycardia', 'VT': 'Ventricular tachycardia', 'NOD': 'Junctional (nodal) rhythm',
    'SVTA': 'Supraventricular tachyarrhythmia', 'IVR': 'Idioventricular rhythm', 'P': 'Paced rhythm',
    'AB': 'Atrial bigeminy', 'VFL': 'Ventricular flutter', 'PREX': 'Pre-excitation'}
RHYTHM_COLOUR = {'N': '#e6f4ea', 'AFIB': '#fde2e1', 'AFL': '#fde2e1', 'B': '#fff0db', 'T': '#fff0db', 'BII': '#ece4fb',
                 'VT': '#fde2e1', 'SBR': '#e7f1fb'}
COMMENT_MEANING = {'MISSB': ('blocked P', 'A P wave that was not conducted to the ventricles (a missed beat)'),
                   'PSE': ('pause', 'A pause')}


# ------------------------------------------------------------------------------------------------- downloading
def http_get(url, dest, tries=6):
    """download url to dest, resuming a part that has come already; retried, as connections are sometimes cut"""
    part = dest + '.part'
    for k in range(tries):
        try:
            have = os.path.getsize(part) if os.path.exists(part) else 0
            req = urllib.request.Request(url, headers={'User-Agent': 'bms-workbench-recordings/1'})
            if have:
                req.add_header('Range', f'bytes={have}-')
            with urllib.request.urlopen(req, timeout=120) as r:
                mode = 'ab' if have and r.status == 206 else 'wb'
                with open(part, mode) as f:
                    while True:
                        b = r.read(1 << 16)
                        if not b:
                            break
                        f.write(b)
            os.replace(part, dest)
            return dest
        except urllib.error.HTTPError as e:
            if e.code == 416:  # (the whole file was there already)
                os.replace(part, dest)
                return dest
            if e.code == 404:
                raise
            err = e
        except Exception as e:  # noqa: BLE001 (a cut connection: try again)
            err = e
        time.sleep(2 + 2 * k)
    raise RuntimeError(f'could not download {url}: {err}')


class Cache:
    def __init__(self, root):
        self.root = root
        self.sums = {}

    def _sums(self, db, ver):
        key = db + '/' + ver
        if key not in self.sums:
            p = os.path.join(self.root, db, ver, 'SHA256SUMS.txt')
            os.makedirs(os.path.dirname(p), exist_ok=True)
            try:
                if not os.path.exists(p):
                    http_get(FILES + f'{db}/{ver}/SHA256SUMS.txt', p)
                self.sums[key] = dict(reversed(line.split(None, 1)) for line in open(p).read().strip().splitlines() if line.strip())
                self.sums[key] = {k.strip(): v for k, v in self.sums[key].items()}
            except Exception as e:  # noqa: BLE001
                print(f'  (no checksums for {db}: {e})')
                self.sums[key] = {}
        return self.sums[key]

    def get(self, db, ver, rel):
        """the local path of a database's file (downloaded and checked the first time)"""
        p = os.path.join(self.root, db, ver, rel)
        sums = self._sums(db, ver)
        if os.path.exists(p) and (rel not in sums or sha256(p) == sums[rel]):
            return p
        os.makedirs(os.path.dirname(p), exist_ok=True)
        print(f'  downloading {db}/{rel}')
        http_get(FILES + f'{db}/{ver}/{rel}', p)
        if rel in sums and sha256(p) != sums[rel]:
            os.remove(p)
            raise RuntimeError(f'{db}/{rel} does not match its checksum: try again')
        return p


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


# ------------------------------------------------------------------------------------------------- reading
def read_edf(path):
    """a small reader of EDF/EDF+ files: the signals (one sampling rate) without the annotation channel.
    (wfdb's reader takes the rate of the annotation channel for the whole file, which halves the EEG's.)"""
    raw = open(path, 'rb').read()
    ns = int(raw[252:256])
    nrec = int(raw[236:244])
    dur = float(raw[244:252])
    hd = raw[256:256 + ns * 256]

    def field(off, w):
        return [hd[off + i * w: off + (i + 1) * w].decode('latin-1').strip() for i in range(ns)]
    o = 0
    labels = field(o, 16); o += 16 * ns
    o += 80 * ns
    dims = field(o, 8); o += 8 * ns
    pmin = [float(x) for x in field(o, 8)]; o += 8 * ns
    pmax = [float(x) for x in field(o, 8)]; o += 8 * ns
    dmin = [float(x) for x in field(o, 8)]; o += 8 * ns
    dmax = [float(x) for x in field(o, 8)]; o += 8 * ns
    o += 80 * ns
    spr = [int(x) for x in field(o, 8)]
    data = np.frombuffer(raw[256 + ns * 256:], dtype='<i2')
    per = sum(spr)
    data = data[:nrec * per].reshape(nrec, per)
    sig, names, units, rates = [], [], [], []
    k = 0
    for i in range(ns):
        seg = data[:, k:k + spr[i]].reshape(-1).astype(np.float64)
        k += spr[i]
        if labels[i].startswith('EDF Annotations'):
            continue
        g = (pmax[i] - pmin[i]) / (dmax[i] - dmin[i])
        sig.append((seg - dmin[i]) * g + pmin[i])
        names.append(labels[i].strip('.'))
        units.append(dims[i])
        rates.append(spr[i] / dur)
    assert len(set(rates)) == 1, rates
    return np.stack(sig, axis=1), rates[0], names, units


def read_part(cache, db, ver, part, chans):
    """the samples of one part (block) of a recording → (fs, array [n, channels], header comments)"""
    rec = part['record']
    if rec.endswith('.edf'):
        p = cache.get(db, ver, rec)
        x, fs, names, units = read_edf(p)
        up = [n.upper() for n in names]
        cols = [up.index(c['src'].upper()) for c in chans]
        a, b = int(round(part['from'] * fs)), int(round(part['to'] * fs))
        return fs, x[a:b, cols], [], [units[i] for i in cols]
    hea = cache.get(db, ver, rec + '.hea')
    h = wfdb.rdheader(hea[:-4])
    fs = h.fs
    names = [n.strip().rstrip(',') for n in h.sig_name]
    idx = [names.index(c['src']) for c in chans]
    # the signal files of those channels
    d = os.path.dirname(rec)
    for fn in sorted(set(h.file_name[i] for i in idx)):
        cache.get(db, ver, (d + '/' if d else '') + fn)
    a = int(round(part.get('from', 0) * fs))
    b = int(round(part['to'] * fs)) if part.get('to') is not None else h.sig_len
    r = wfdb.rdrecord(hea[:-4], sampfrom=a, sampto=b, channels=idx)
    return fs, r.p_signal, h.comments, [r.units[i] for i in range(len(idx))]


# ------------------------------------------------------------------------------------------------- beats
def detect_r(x, fs):
    """the R waves of an ECG: wfdb's XQRS detector, each beat then moved to the largest deflection near it"""
    xr = resample_poly(x, 1, int(fs // 250)) if fs >= 500 and fs % 250 == 0 else x
    fr = fs / (int(fs // 250)) if fs >= 500 and fs % 250 == 0 else fs
    q = processing.xqrs_detect(sig=np.nan_to_num(xr), fs=fr, verbose=False)
    sos = butter(2, [5, 30], 'bandpass', fs=fs, output='sos')
    y = sosfiltfilt(sos, np.nan_to_num(x))
    # the polarity of the QRS: the larger of the positive and negative deflections
    pol = 1 if np.percentile(y, 99.5) >= -np.percentile(y, 0.5) else -1
    w = int(0.08 * fs)
    out = []
    for s in q:
        c = int(round(s * fs / fr))
        lo, hi = max(0, c - w), min(len(x), c + w)
        if hi <= lo:
            continue
        seg = pol * y[lo:hi]
        out.append(lo + int(np.argmax(seg)))
    out = np.unique(np.array(out, dtype=int))
    # (two detections of one beat: keep one)
    keep = [out[0]] if len(out) else []
    for s in out[1:]:
        if s - keep[-1] > 0.25 * fs:
            keep.append(s)
    return np.array(keep) / fs


# ------------------------------------------------------------------------------------------------- rhythms
def rhythm_spans(cache, db, ver, part, ext, dur, names=None):
    """the rhythms of an excerpt, from the rhythm annotations ('+' with an aux note such as '(AFIB') of a database's
    annotation file: one span from each change to the next, starting with the rhythm already under way"""
    hea = cache.get(db, ver, part['record'] + '.hea')
    hd = wfdb.rdheader(hea[:-4])
    a0 = int(round(part.get('from', 0) * hd.fs))
    a1 = int(round(part['to'] * hd.fs)) if part.get('to') is not None else hd.sig_len
    p = cache.get(db, ver, part['record'] + '.' + ext)
    base = p[:-(len(ext) + 1)]
    ann = wfdb.rdann(base, ext, sampfrom=a0, sampto=a1)
    aux = [s.strip('\x00').strip() for s in ann.aux_note]
    ch = [((s - a0) / ann.fs, a) for s, sym, a in zip(ann.sample, ann.symbol, aux) if sym == '+' and a.startswith('(')]
    # the rhythm already under way when the excerpt starts
    if a0 > 0:
        full = wfdb.rdann(base, ext, sampto=a0 + 1)
        before = [a.strip('\x00').strip() for s, a in zip(full.symbol, full.aux_note) if s == '+' and a.strip('\x00').strip().startswith('(')]
        if before and (not ch or ch[0][0] > 0.01):
            ch.insert(0, (0.0, before[-1]))
    names = names or {}
    out = []
    for i, (tt, a) in enumerate(ch):
        code = a.lstrip('(')
        t1 = ch[i + 1][0] if i + 1 < len(ch) else dur
        out.append({'t0': round(max(0.0, float(tt)), 3), 't1': round(float(t1), 3), 'code': code,
                    'text': names.get(code, RHYTHM_MEANING.get(code, code)), 'colour': RHYTHM_COLOUR.get(code, '#eef1f5')})
    # (a rhythm that starts in the last moment of the excerpt cannot be seen: the one before it runs to the end)
    while len(out) > 1 and out[-1]['t1'] - out[-1]['t0'] < 0.5:
        out.pop()
        out[-1]['t1'] = round(float(dur), 3)
    return out


# ------------------------------------------------------------------------------------------------- making one
def quantise(x):
    """float samples → int16 with scale and offset (NaN → -32768)"""
    ok = np.isfinite(x)
    if not ok.any():
        return np.full(len(x), -32768, np.int16), 1.0, 0.0
    lo, hi = float(np.min(x[ok])), float(np.max(x[ok]))
    off = (lo + hi) / 2
    scale = (hi - lo) / 65000 if hi > lo else 1.0
    q = np.round((x - off) / scale)
    q[~ok] = -32768
    return np.clip(q, -32767, 32767).astype(np.int16), scale, off


def display_range(x, kind):
    """the scale a channel opens with: its range in the excerpt (the 0.2nd to 99.8th percentiles, with a margin)"""
    ok = x[np.isfinite(x)]
    lo, hi = np.percentile(ok, 0.2), np.percentile(ok, 99.8)
    if kind in ('ecg',):
        lo, hi = min(lo, np.min(ok)), max(hi, np.max(ok))
    pad = (hi - lo) * 0.08 or 1
    return [float(f'{lo - pad:.4g}'), float(f'{hi + pad:.4g}')]


def make(defn, cache, preview=False):
    rid = defn['id']
    db = defn['source']['db']
    info = DBS[db]
    ver = info['version']
    parts = defn['source'].get('parts') or [{'record': defn['source']['record'], 'from': defn['source'].get('from', 0), 'to': defn['source'].get('to'), 'label': ''}]
    chans = defn['channels']
    sig_parts, blocks, comments = [], [], []
    fs = None
    units0 = None
    for part in parts:
        f, x, com, units = read_part(cache, db, ver, part, chans)
        target = defn.get('resample')
        if target and target != f:
            num, den = int(target), int(f)
            g = np.gcd(num, den)
            x = resample_poly(x, num // g, den // g, axis=0)
            f = target
        if defn.get('highpass'):
            sos = butter(2, defn['highpass'], 'highpass', fs=f, output='sos')
            x = np.stack([sosfiltfilt(sos, x[:, k]) for k in range(x.shape[1])], axis=1)
        if fs is None:
            fs, comments, units0 = f, com, units
        assert f == fs, 'the parts of a recording need one sampling rate'
        blocks.append({'start': sum(len(s) for s in sig_parts), 'n': len(x), 'label': part.get('label', ''), 'record': part['record'], 'from': part.get('from', 0)})
        sig_parts.append(x)
    x = np.concatenate(sig_parts, axis=0)
    n = len(x)
    # the channels
    channels, raw = [], []
    for k, c in enumerate(chans):
        v = x[:, k] * c.get('factor', 1)
        if c.get('center'):
            # (a channel with a large, meaningless offset – an uncalibrated baseline – is centred on zero)
            v = v - float(np.nanmedian(v))
        q, scale, off = quantise(v)
        raw.append(q)
        ch = {'name': c['name'], 'short': c.get('short', c['name']), 'units': c.get('units', units0[k]), 'kind': c.get('kind', 'other'),
              'scale': float(f'{scale:.6g}'), 'offset': float(f'{off:.6g}'), 'range': c.get('range') or display_range(v, c.get('kind'))}
        for key in ('about', 'hidden', 'audio'):
            if c.get(key):
                ch[key] = c[key]
        channels.append(ch)
    short = [c['short'] for c in channels]
    out = {'format': 'bms-recording-1', 'id': rid, 'title': defn['title'], 'group': defn['group'], 'summary': defn.get('summary', ''),
           'description': defn.get('description', ''), 'look_for': defn.get('look_for', []), 'fs': fs, 'n': n,
           'duration': round(n / fs, 3), 'file': rid + '.bin', 'channels': channels}
    if len(blocks) > 1:
        out['blocks'] = [{'start': b['start'], 'n': b['n'], 'label': b['label']} for b in blocks]
    if defn.get('view'):
        out['view'] = defn['view']
    # beats, rhythms and events
    events, rhythms = [], []
    B = defn.get('beats')
    if B:
        part = parts[0]
        f0 = fs
        if 'ann' in B:
            # (the annotations are read at the database's own rate)
            hea = cache.get(db, ver, part['record'] + '.hea')
            hd = wfdb.rdheader(hea[:-4])
            a0 = int(round(part.get('from', 0) * hd.fs))
            a1 = int(round(part['to'] * hd.fs)) if part.get('to') is not None else hd.sig_len
            p = cache.get(db, ver, part['record'] + '.' + B['ann'])
            ann = wfdb.rdann(p[:-(len(B['ann']) + 1)], B['ann'], sampfrom=a0, sampto=a1)
            t = (np.asarray(ann.sample) - a0) / ann.fs
            sym = list(ann.symbol)
            aux = [s.strip('\x00').strip() for s in ann.aux_note]
            if B.get('chan') is not None:
                m = np.asarray(ann.chan) == B['chan']
                t, sym, aux = t[m], [s for s, k in zip(sym, m) if k], [s for s, k in zip(aux, m) if k]
            beats = [(tt, s) for tt, s in zip(t, sym) if s in BEAT_MEANING]
            bt = [round(float(tt), 4) for tt, s in beats]
            codes = ''.join(s for tt, s in beats) if B.get('labels') else ''
            out['beats'] = {'channel': short.index(B['channel']), 't': bt, 'source': B.get('source', 'database'), 'note': B.get('note', '')}
            if codes:
                out['beats']['code'] = codes
                out['beats']['legend'] = {c: BEAT_MEANING[c][0].upper() + BEAT_MEANING[c][1:] for c in sorted(set(codes), key=lambda c: (c != 'N', c))}
            # rhythms: from one change to the next
            if B.get('rhythms'):
                rhythms = rhythm_spans(cache, db, ver, part, B['ann'], n / fs)
            if B.get('comments'):
                for tt, s, a in zip(t, sym, aux):
                    if s == '"' and a in COMMENT_MEANING:
                        lab, title = COMMENT_MEANING[a]
                        events.append({'t': round(float(tt), 4), 'channel': short.index(B['channel']), 'label': lab, 'title': title, 'colour': '#7048e8'})
        else:
            k = short.index(B['detect'])
            bt = detect_r(x[:, k], fs)
            out['beats'] = {'channel': k, 't': [round(float(v), 4) for v in bt], 'source': 'detected',
                            'note': B.get('note', 'The beats were found automatically by the workbench (the R waves of ' + chans[k]['name'] + '), and checked by eye, but not by a cardiologist.')}
    # the rhythms, from an annotation file of their own (when the beats are not the database's)
    RH = defn.get('rhythms')
    if RH:
        rhythms = rhythm_spans(cache, db, ver, parts[0], RH['ann'], n / fs, RH.get('names'))
    for e in defn.get('events', []):
        ev = {'t': e['t'], 'text': e['text']}
        if e.get('channel'):
            ev['channel'] = short.index(e['channel'])
        events.append(ev)
    E = defn.get('db_events')
    if E:
        part = parts[0]
        hea = cache.get(db, ver, part['record'] + '.hea')
        hd = wfdb.rdheader(hea[:-4])
        a0 = int(round(part.get('from', 0) * hd.fs))
        a1 = int(round(part['to'] * hd.fs)) if part.get('to') is not None else hd.sig_len
        p = cache.get(db, ver, part['record'] + '.' + E['ann'])
        ann = wfdb.rdann(p[:-(len(E['ann']) + 1)], E['ann'], sampfrom=a0, sampto=a1)
        for s, aux in zip(ann.sample, ann.aux_note):
            text = aux.strip('\x00').strip()
            text = E.get('rename', {}).get(text, text)
            if E.get('only') and text not in E['only']:
                continue
            ev = {'t': round((s - a0) / ann.fs, 3), 'text': text}
            if E.get('channel'):
                ev['channel'] = short.index(E['channel'])
                ev.pop('text')
                ev['label'] = E.get('label', '')
                ev['title'] = E.get('title', text)
                ev['colour'] = E.get('colour', '#2b8a3e')
            events.append(ev)
    S = defn.get('heart_sounds')
    if S:
        import scipy.io
        p = cache.get('challenge-2016', '1.0.0', S['file'])
        m = scipy.io.loadmat(p)
        key = [k for k in m if not k.startswith('__')][0]
        for a, b in m[key]:
            name = str(np.squeeze(b)).strip("[]'\" ")
            if name in ('S1', 'S2'):
                t = int(np.squeeze(a)) / S.get('fs', 2000)
                if 0 <= t <= n / fs:
                    events.append({'t': round(t, 4), 'channel': short.index(S['channel']), 'label': name, 'title': 'The start of the ' + ('first' if name == 'S1' else 'second') + ' heart sound (' + name + '), marked by hand', 'colour': '#d6336c' if name == 'S1' else '#1971c2'})
    events.sort(key=lambda e: e['t'])
    if events:
        out['events'] = events
    if rhythms:
        out['rhythms'] = rhythms
    # the person, as the database describes them
    out['subject'] = defn.get('subject', {})
    # where it comes from
    src = defn['source']
    whole = len(parts) == 1 and parts[0].get('to') is None and not parts[0].get('from')
    excerpt = (f'All {fmt_s(n / fs)} s of' if whole else
               f'{fmt_s(n / fs)} s ({fmt_s(parts[0].get("from", 0))}–{fmt_s(parts[0].get("from", 0) + n / fs)} s) of'
               if len(parts) == 1 else ' and '.join(f'{fmt_s(p.get("to") - p.get("from", 0))} s of {p["record"].split("/")[-1].replace(".edf", "")} ({fmt_s(p.get("from", 0))}–{fmt_s(p.get("to"))} s)' for p in parts) + ', from')
    records = ', '.join(p['record'].replace('.edf', '') for p in parts)
    out['source'] = {'database': info['name'], 'version': ver, 'url': f'https://physionet.org/content/{db}/{ver}/', 'record': records,
                     'excerpt': (excerpt[0].upper() + excerpt[1:]) if excerpt else '', 'licence': ODC_BY,
                     'licence_url': f'https://physionet.org/content/{db}/view-license/{ver}/',
                     'doi': ('https://doi.org/' + info['doi']) if info.get('doi') else '',
                     'cite_database': info.get('cite_database') or (f'{info["name"]} (version {ver}). PhysioNet. https://doi.org/{info["doi"]}' if info.get('doi') else f'{info["name"]} (version {ver}). PhysioNet. https://physionet.org/content/{db}/{ver}/'),
                     'cite_original': info.get('cite_original', ''), 'cite_physionet': PHYSIONET_CITES,
                     'changes': defn.get('changes', 'A short excerpt; the samples are stored as 16-bit numbers.')}
    # write
    os.makedirs(OUT, exist_ok=True)
    data = np.concatenate(raw).astype('<i2').tobytes()
    open(os.path.join(OUT, rid + '.bin'), 'wb').write(data)
    out['bytes'] = len(data)
    json.dump(out, open(os.path.join(OUT, rid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{rid}: {n / fs:.1f} s, {len(channels)} channel(s) at {fs} Hz, {len(data) / 1024:.0f} KB'
          + (f', {len(out["beats"]["t"])} beats ({out["beats"]["source"]})' if out.get('beats') else '')
          + (f', {len(rhythms)} rhythm spans' if rhythms else '') + (f', {len(events)} events' if events else ''))
    if preview:
        draw_preview(out, raw, cache.root)
    return out


def fmt_s(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def draw_preview(out, raw, root):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n, fs = out['n'], out['fs']
    t = np.arange(n) / fs
    chs = out['channels']
    fig, axs = plt.subplots(len(chs) + (1 if out.get('beats') else 0), 1, figsize=(min(60, 4 + out['duration'] * 0.6), 1.8 * (len(chs) + 1)), sharex=True)
    axs = np.atleast_1d(axs)
    for k, c in enumerate(chs):
        v = raw[k].astype(float)
        v[raw[k] == -32768] = np.nan
        axs[k].plot(t, v * c['scale'] + c['offset'], lw=0.5, color='k')
        axs[k].set_ylabel(f"{c['short']} ({c['units']})")
        axs[k].set_ylim(c['range'])
    if out.get('beats'):
        bt = np.array(out['beats']['t'])
        k = out['beats']['channel']
        for x in bt:
            axs[k].axvline(x, color='r', lw=0.4, alpha=0.6)
        axs[-1].plot(bt[1:], 60 / np.diff(bt), 'o-', ms=2, color='r')
        axs[-1].set_ylabel('HR /min')
    for e in out.get('events', []):
        axs[e.get('channel', 0)].axvline(e['t'], color='b', lw=0.6)
    for ax in axs:
        ax.grid(alpha=0.3)
    plt.tight_layout()
    p = os.path.join(root, 'previews', out['id'] + '.png')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    plt.savefig(p, dpi=45)
    print('  preview:', p)


def write_index(defs):
    recs = []
    for d in defs:
        p = os.path.join(OUT, d['id'] + '.json')
        if not os.path.exists(p):
            continue
        r = json.load(open(p, encoding='utf-8'))
        kinds = [c['kind'] for c in r['channels']]
        kind = next((k for k in ('eeg', 'emg', 'pcg', 'bp', 'ppg', 'resp', 'ecg') if k in kinds), 'other')
        recs.append({'id': r['id'], 'title': r['title'], 'group': r['group'], 'summary': r['summary'], 'duration': r['duration'], 'kind': kind,
                     'fs': r['fs'], 'channels': [c['short'] for c in r['channels'] if not c.get('hidden')] or [c['short'] for c in r['channels']],
                     'bytes': r['bytes'], 'database': r['source']['database'], 'url': r['source']['url'],
                     'licence': r['source']['licence'], 'licence_url': r['source']['licence_url']})
    groups = []
    for d in defs:
        if d['group'] not in groups:
            groups.append(d['group'])
    json.dump({'format': 'bms-recordings-1', 'groups': groups, 'recordings': recs}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(r['bytes'] for r in recs)
    print(f'index.json: {len(recs)} recordings, {total / 1e6:.2f} MB of samples')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--cache', default=os.path.join(os.path.expanduser('~'), '.cache', 'bms-workbench', 'physionet'))
    ap.add_argument('--preview', action='store_true')
    a = ap.parse_args()
    defs = json.load(open(os.path.join(HERE, 'recordings.json'), encoding='utf-8'))['recordings']
    cache = Cache(a.cache)
    for d in defs:
        if a.ids and d['id'] not in a.ids:
            continue
        make(d, cache, a.preview)
    write_index(defs)


if __name__ == '__main__':
    main()
