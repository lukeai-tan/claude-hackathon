"""Bounded UI caches and direct pixel transfer (no PNG encode/decode)."""
from collections import OrderedDict
from PIL import Image


def pixmap_image(pix):
    return Image.frombytes('RGBA' if pix.alpha else 'RGB', (pix.width, pix.height), pix.samples)


class PageCache:
    def __init__(self, limit=8):
        self.limit = limit
        self.owner = None
        self.data = OrderedDict()

    def sync(self, doc):
        if self.owner is not doc:
            self.owner = doc
            self.data.clear()

    def invalidate(self, pages=None):
        if pages is None:
            self.data.clear()
        else:
            for key in list(self.data):
                if key[1] in pages:
                    del self.data[key]

    def get(self, doc, kind, page, factory, variant=None):
        self.sync(doc)
        key = (kind, page, variant)
        if key not in self.data:
            self.data[key] = factory()
        self.data.move_to_end(key)
        # Bound each kind independently; a text lookup should not evict the
        # current rendered image. Large zoom images are limited separately.
        keys = [k for k in self.data if k[0] == kind]
        limit = 2 if kind == 'image' else self.limit
        while len(keys) > limit:
            del self.data[keys.pop(0)]
        return self.data[key]

