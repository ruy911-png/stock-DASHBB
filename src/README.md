# Dashboard source

`dashboard.template.html` is the editable source embedded in the generated root
`index.html` file. The asset manifest and deployment wrapper remain in
`index.html` so the currently deployed page keeps the same runtime behavior.

Use the following commands from the repository root:

```text
npm run check
npm run build
```

Edit `src/dashboard.template.html`, run `npm run build`, and commit both files.
The pull-request workflow rejects changes when the source and generated bundle
are out of sync.
