# Epson TM-T88V (M244A) Receipt Printer — Setup Reference

**Status:** Reference (validated working)
**Date:** 2026-06-17
**Author:** Pit Station Dev
**Scope:** Host-side (Fedora 43) CUPS configuration for local PT-2 print testing
**Hardware:** Epson model **M244A** = **TM-T88V** thermal receipt printer (80 mm roll)

---

## 1. Summary

This documents how the Epson **M244A / TM-T88V** thermal receipt printer was configured on
a Fedora 43 workstation so PT-2's existing browser print path (`window.print()`) can print
to it. All changes are **host-side CUPS configuration** — the printer hardware/firmware is
**not** modified.

| Fact | Value |
|---|---|
| Marketing model | Epson TM-T88V |
| Hardware model code | **M244A** |
| USB ID | `04b8:0202` (Seiko Epson, UB-U05 interface) |
| CUPS device URI | `usb://EPSON/TM-T88V?serial=4D5138467113430000` |
| Device node | `/dev/usb/lp0` (root:lp) |
| CUPS queue name | `TM-T88V` (set as system default) |
| Paper | 80 mm roll, cut-per-job, drawer-kick |

---

## 2. Why this driver (decision record)

- Epson's **official** Linux driver (`tmx-cups 3.0.0.0`, source-only, GPLv3) is **license-gated**
  and its supported-model list covers TM-T88**VI**/T88**VII** but **NOT** the plain TM-T88V.
- The reliable open route for the plain T88V is the purpose-built community driver
  **`groolot/epson-tm-t88v-driver`** (GitHub), which ships the `rastertotmt88v` CUPS filter
  + a TM-T88V PPD. It is freely cloneable and compilable.

### Why a full driver (not a raw queue)

PT-2 prints via the **browser** — `window.print()` through an iframe
(`lib/print/iframe-print.ts`, `lib/print/hooks/use-print-reward.ts`,
`components/mtl/mtl-entry-view-modal.tsx`). The browser sends **rasterized/PDF** data into
CUPS, so the queue needs a **PPD + rasterizing filter**. A raw ESC/POS queue would **not**
work with the current app (that would require rewriting PT-2's print path to emit ESC/POS bytes).

---

## 3. Reproduce the setup

### 3.1 Prerequisites (one-time, needs sudo)

```bash
sudo dnf install -y autoconf automake libtool autoconf-archive cups-devel
# g++, gcc, make, cups, gss already present on a typical Fedora workstation
```

### 3.2 Build + install the driver

```bash
git clone --depth 1 https://github.com/groolot/epson-tm-t88v-driver /tmp/tm-t88v-driver
cd /tmp/tm-t88v-driver
```

**Required source patch** — the 2017-era C++ will not compile under Fedora 43's modern g++
with the upstream warning flags. Soften them before building:

- `src/Makefile.am` — replace the `AM_CXXFLAGS` line with:
  ```
  AM_CXXFLAGS = -I$(top_srcdir)/src -Wall -fstack-protector -Wno-deprecated -Wno-deprecated-declarations
  ```
  (removes `-Werror -Wconversion -Wsign-conversion -Wduplicated-cond -Wsign-promo -Wshadow`)
- `configure.ac` — change `AM_INIT_AUTOMAKE([foreign -Wall -Werror])` to
  `AM_INIT_AUTOMAKE([foreign -Wall])`.

Then:

```bash
autoreconf -fiv
./configure --prefix=/usr
make
sudo make install
```

Installs:
- Filter → `/usr/lib/cups/filter/rastertotmt88v`
- PPD → `/usr/share/ppd/epson-thermal-printer/epson-tm-t88v-rastertotmt88v.ppd`

### 3.3 Create the CUPS queue (no sudo needed if user is in CUPS SystemGroup)

```bash
lpadmin -p TM-T88V \
  -v "usb://EPSON/TM-T88V?serial=4D5138467113430000" \
  -P /usr/share/ppd/epson-thermal-printer/epson-tm-t88v-rastertotmt88v.ppd \
  -E
lpadmin -d TM-T88V   # set as system default (optional)
```

> The serial in the URI is device-specific. Re-discover with `lpinfo -v | grep usb`.

### 3.4 Verify

```bash
lpstat -t                       # queue enabled + accepting
lp -d TM-T88V /path/to/test.txt # CLI test print
lpstat -W completed -o TM-T88V  # confirm job completed
```

A successful job logs `cfFilterGhostscript: Rendering completed` and drains with no entries
in `/var/log/cups/error_log`.

---

## 4. Using it from PT-2

- The printer appears as **`TM-T88V`** in Chrome/Firefox print dialogs (default-selected if
  set as system default).
- In the print dialog set **Margins: None** and **Scale: 100%**.
- PT-2's print CSS should target the ~72 mm printable width (80 mm roll minus margins) so
  receipt content is not clipped.

---

## 5. Reversibility / teardown

```bash
lpadmin -x TM-T88V                                                  # remove queue
sudo rm /usr/lib/cups/filter/rastertotmt88v                         # remove filter
sudo rm -r /usr/share/ppd/epson-thermal-printer                     # remove PPD
```

Nothing on the printer hardware is changed by any of the above.

---

## 6. Notes

- CUPS 2.4 emits *"Printer drivers are deprecated and will stop working in a future version
  of CUPS"* — PPD-based queues still work today; the long-term path is driverless IPP.
- If PT-2 later moves to **ESC/POS** (server-side byte generation for precise column/cut/
  drawer control), that is an **app-code change** plus a **raw** CUPS queue — a different
  configuration from this raster/driver setup.
