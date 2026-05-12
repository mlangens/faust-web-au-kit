# Native Validation Layer

`npm run test:native` is the host-dependent top of the test pyramid.

Use it for:

- AU validation and installation smoke checks
- native-wrapper regressions that the preview cannot see
- future host-specific checks once the framework grows beyond the current proof of concept

By default it validates the workspace default app. Use `-- --app <app-key>` to validate another registered app, for example:

```sh
npm run test:native -- --app pulse-pad
```

Keep the default local and CI path focused on `npm test`, then opt into native validation when you need confidence in the shipped plugin surface.

The validation path still serializes access to each app’s user AU install path so overlapping runs do not clobber `~/Library/Audio/Plug-Ins/Components` mid-copy, and native build products now land in `build/apps/<app-key>/`.

For bulk host smoke work on the active framework studio suite, use the suite commands outside the default test pyramid:

- `npm run install:suite`
- `npm run uninstall:local -- --app pulse-pad --scope both`
- `npm run uninstall:suite -- --scope both`
- `npm run package:suite-installer`
- `npm run package:suite-uninstaller`
