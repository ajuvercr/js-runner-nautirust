# data-sync.js

A small js library that syncs object across runtimes.

## Contents

- `FileDataSync`

Stores objects as a file. Changing the inner state when the file is changed.

Usage:

```js

async main() {
    const dataSync = create("file", "file.json"); 

    const item = await dataSync.get();

    const isFirstTime = !!item;

    await dataSync.set(42);
}
```
