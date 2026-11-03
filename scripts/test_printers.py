import ctypes
from ctypes import wintypes
import winreg
import socket
import re

cfgmgr32 = ctypes.windll.cfgmgr32
CM_GETIDLIST_FILTER_PRESENT = 0x00000100

def get_present_device_ids():
    pulLen = wintypes.ULONG()
    res = cfgmgr32.CM_Get_Device_ID_List_SizeW(ctypes.byref(pulLen), None, CM_GETIDLIST_FILTER_PRESENT)
    if res != 0 or pulLen.value <= 1:
        return set()
    buf = ctypes.create_unicode_buffer(pulLen.value)
    res = cfgmgr32.CM_Get_Device_ID_ListW(None, buf, pulLen.value, CM_GETIDLIST_FILTER_PRESENT)
    if res != 0:
        return set()
    raw = ''.join(buf[:pulLen.value])
    return {s.upper() for s in raw.split('\x00') if s}

def get_installed_printers():
    printers = []
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Print\Printers')
        count = winreg.QueryInfoKey(key)[0]
        for i in range(count):
            pname = winreg.EnumKey(key, i)
            sub = winreg.OpenKey(key, pname)
            try:
                port, _ = winreg.QueryValueEx(sub, 'Port')
            except Exception:
                port = ''
            try:
                driver, _ = winreg.QueryValueEx(sub, 'Printer Driver')
            except Exception:
                driver = ''
            printers.append({'name': pname, 'port': port, 'driver': driver})
    except Exception as e:
        print('Registry error:', e)
    return printers

installed = get_installed_printers()
present_ids = get_present_device_ids()
print('Present device IDs count:', len(present_ids))

has_any_usb_printer = any('USBPRINT' in did for did in present_ids)
print('Any USB printer hardware connected right now?', has_any_usb_printer)

for p in installed:
    name_l = p['name'].lower()
    port_l = p['port'].lower()
    driver_l = p['driver'].lower()
    
    # Filter virtual printers
    if port_l in ('nul:', 'portprompt:', '') or any(x in name_l for x in ['pdf', 'onenote', 'xps', 'fax']) or any(x in driver_l for x in ['pdf', 'onenote', 'xps', 'fax']):
        continue
        
    is_usb = p['port'].upper().startswith('USB')
    is_network = any(p['port'].upper().startswith(x) for x in ['IP_', 'WSD-', 'HTTP']) or bool(re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', p['port']))
    
    conn_type = 'USB Cable' if is_usb else ('Wi-Fi / Network' if is_network else 'Direct Port')
    
    is_online = False
    status_text = 'Disconnected / Turned Off'
    badge_color = 'red'
    
    if is_usb:
        if has_any_usb_printer:
            tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', p['name'].upper()) if len(t) > 2]
            for did in present_ids:
                if 'USBPRINT' in did and any(t in did for t in tokens):
                    is_online = True
                    break
        if is_online:
            status_text = 'Connected & Ready'
            badge_color = 'green'
        else:
            status_text = 'Disconnected / Cable Unplugged'
            badge_color = 'red'
    elif is_network:
        is_online = False
        status_text = 'Offline / Unreachable'
        badge_color = 'red'
    
    print(f"Printer: {p['name']} | Online: {is_online} | Status: {status_text} | Badge: {badge_color} | Port: {p['port']}")

