# NPM install fix

Jika `npm install` mencoba download dari domain internal seperti:

```txt
packages.applied-caas-gateway1.internal.api.openai.org
```

hapus `package-lock.json`, set registry public npm, lalu install ulang:

```powershell
npm config set registry https://registry.npmjs.org/
npm cache clean --force
Remove-Item package-lock.json -Force -ErrorAction SilentlyContinue
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm install --registry=https://registry.npmjs.org/
```

Patch ZIP ini sudah tidak menyertakan `package-lock.json`, supaya `npm install` membuat lockfile baru memakai registry publik.
