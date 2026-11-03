with open('backend/app/windows_printer.py', 'r', encoding='utf-8') as f:
    text = f.read()

old = """    command = [sumatra_path]

    if printer_name:
        command += ["-print-to", printer_name]
    else:
        command += ["-print-to-default"]

    command += [
        "-print-settings", settings,
        "-silent",
        pdf_path,
    ]"""

new = """    command = [sumatra_path, "-silent", "-exit-when-done"]

    if printer_name:
        command += ["-print-to", printer_name]
    else:
        command += ["-print-to-default"]

    command += [
        "-print-settings", settings,
        pdf_path,
    ]"""

if old in text:
    text = text.replace(old, new)
    with open('backend/app/windows_printer.py', 'w', encoding='utf-8') as f:
        f.write(text)
    print('Updated windows_printer.py successfully')
else:
    print('Target not found')

