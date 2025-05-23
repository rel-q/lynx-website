<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@lynx-js/rspeedy](./rspeedy.md) &gt; [ChunkSplitBySize](./rspeedy.chunksplitbysize.md) &gt; [strategy](./rspeedy.chunksplitbysize.strategy.md)

## ChunkSplitBySize.strategy property

The ChunkSplitting strategy.

**Signature:**

```typescript
strategy: 'split-by-size';
```

## Remarks

- `split-by-experience`<!-- -->(default): an empirical splitting strategy, automatically splits some commonly used npm packages into chunks of moderate size.

- `split-by-module`<!-- -->: split by NPM package granularity, each NPM package corresponds to a chunk.

- `split-by-size`<!-- -->: automatically split according to module size.

- `all-in-one`<!-- -->: bundle all codes into one chunk.

- `single-vendor`<!-- -->: bundle all NPM packages into a single chunk.

- `custom`<!-- -->: custom chunk splitting strategy.

