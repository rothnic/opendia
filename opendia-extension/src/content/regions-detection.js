  // === REGION DETECTION (Feature-based, domain-agnostic) ===

  detectRegionsStructure(metadata) {
    const regions = [];
    const allLinks = [];
    let regionId = 0;

    // 1. Detect header
    const header = document.querySelector('header, [role="banner"]');
    if (header) {
      const headerRegion = this.analyzeRegion(header, `header`, 'header');
      if (headerRegion) regions.push(headerRegion);
    }

    // 2. Detect main content area
    const main = document.querySelector('main, [role="main"], #main, .main-content');
    if (main) {
      // Analyze main sections
      const mainSections = this.detectSectionsInContainer(main, regionId);
      regions.push(...mainSections);
      regionId += mainSections.length;
    }

    // 3. Detect footer
    const footer = document.querySelector('footer, [role="contentinfo"]');
    if (footer) {
      const footerRegion = this.analyzeRegion(footer, `footer`, 'footer');
      if (footerRegion) regions.push(footerRegion);
    }

    // 4. Collect all anchor links for quick reference
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    anchors.forEach((a, i) => {
      const rect = a.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        allLinks.push({
          id: `L${i + 1}`,
          text: a.textContent.trim().substring(0, 50),
          href: a.href,
          element: a
        });
      }
    });

    return {
      regions,
      links: allLinks.slice(0, 50) // Top 50 links
    };
  }

  detectSectionsInContainer(container, startId) {
    const sections = [];
    let id = startId;

    // Find top-level children that look like sections
    const children = Array.from(container.children);

    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const region = this.analyzeRegion(child, `R${++id}`, this.inferRegionKind(child));
      if (region) sections.push(region);
    }

    return sections;
  }

  analyzeRegion(element, id, kind) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const region = {
      id,
      kind,
      element
    };

    // Extract title/heading
    const heading = element.querySelector('h1, h2, h3, h4, [class*="head"], [class*="title"]');
    if (heading) {
      region.title = heading.textContent.trim().substring(0, 80);
    }

    // Detect nav lists
    const navLists = this.detectNavLists(element);
    if (navLists.length > 0) {
      region.nav_lists = navLists;
    }

    // Detect card grids
    const cardGrids = this.detectCardGrids(element);
    if (cardGrids.length > 0) {
      region.card_grids = cardGrids;
    }

    // Detect price/meta blocks for product pages
    if (this.looksLikeProductPage()) {
      const priceBlocks = this.detectPriceBlocks(element);
      if (priceBlocks.length > 0) {
        region.price_blocks = priceBlocks;
      }

      const features = this.detectFeatureList(element);
      if (features.length > 0) {
        region.feature_list = features.slice(0, 5);
      }
    }

    // Extract key text if no structure detected
    if (!region.nav_lists && !region.card_grids && !region.price_blocks) {
      const text = element.textContent.trim();
      if (text.length > 0 && text.length < 500) {
        region.description = text.substring(0, 200);
      }
    }

    return region;
  }

  inferRegionKind(element) {
    const classes = element.className.toLowerCase();
    const id = element.id.toLowerCase();

    if (/product|item/.test(classes + id)) return 'product_detail';
    if (/gallery|image|photo/.test(classes + id)) return 'media_gallery';
    if (/price|cart|buy/.test(classes + id)) return 'purchase_info';
    if (/review|rating|qa/.test(classes + id)) return 'social_proof';
    if (/tabs|nav/.test(classes + id)) return 'navigation';
    if (/widget|tool/.test(classes + id)) return 'widget';

    return 'section';
  }

  detectNavLists(container) {
    const lists = [];

    // Find ul/ol with links
    const ulElements = Array.from(container.querySelectorAll('ul, ol, nav'));

    for (const ul of ulElements) {
      const links = Array.from(ul.querySelectorAll('a[href]'));
      if (links.length >= 3 && links.length <= 20) {
        // Check if links are short (nav-like)
        const avgLength = links.reduce((sum, a) => sum + a.textContent.trim().length, 0) / links.length;
        if (avgLength < 50) {
          lists.push({
            name: this.getListName(ul),
            count: links.length,
            items: links.slice(0, 10).map(a => a.textContent.trim())
          });
        }
      }
    }

    return lists;
  }

  detectCardGrids(container) {
    const grids = [];

    // Find repeated items using feature similarity
    const candidates = this.findRepeatedItemCandidates(container);

    for (const group of candidates) {
      if (group.items.length >= 3) {
        grids.push({
          type: group.type,
          count: group.items.length,
          preview: this.extractCardPreview(group.items[0])
        });
      }
    }

    return grids;
  }

  findRepeatedItemCandidates(container) {
    const children = Array.from(container.children);
    const features = new Map();

    // Compute features for each child
    for (const child of children) {
      const feature = this.computeElementFeature(child);
      if (!feature) continue;

      const sig = feature.signature;
      if (!features.has(sig)) {
        features.set(sig, []);
      }
      features.get(sig).push({ element: child, feature });
    }

    // Find groups with 3+ items
    const groups = [];
    for (const [sig, items] of features) {
      if (items.length >= 3) {
        groups.push({
          signature: sig,
          type: this.classifyGroupType(items[0].feature),
          items: items.map(i => i.element)
        });
      }
    }

    return groups;
  }

  computeElementFeature(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const hasImage = !!element.querySelector('img');
    const hasLink = !!element.querySelector('a[href]');
    const hasButton = !!element.querySelector('button');
    const textLength = element.textContent.trim().length;

    // Round dimensions for grouping
    const w = Math.round(rect.width / 20) * 20;
    const h = Math.round(rect.height / 20) * 20;

    const signature = `${element.tagName}:${w}x${h}:${hasImage}:${hasLink}:${hasButton}`;

    return {
      tag: element.tagName.toLowerCase(),
      width: rect.width,
      height: rect.height,
      hasImage,
      hasLink,
      hasButton,
      textLength,
      signature
    };
  }

  classifyGroupType(feature) {
    if (feature.hasImage &&feature.height > 200) return 'card_grid';
    if (feature.hasLink && feature.textLength < 100) return 'nav_list';
    if (feature.hasImage && feature.height < 150) return 'thumbnail_strip';
    return 'repeated_items';
  }

  detectPriceBlocks(container) {
    const blocks = [];
    const priceElements = Array.from(container.querySelectorAll('[class*="price"], [class*="cost"], [class*="promo"]'));

    for (const el of priceElements) {
      const text = el.textContent.trim();
      if (text.match(/\$[\d,]+/) || text.toLowerCase().includes('price')) {
        blocks.push({
          text: text.substring(0, 100)
        });
      }
    }

    return blocks.slice(0, 5);
  }

  detectFeatureList(container) {
    const features = [];
    const bullets = Array.from(container.querySelectorAll('li, [class*="feature"]'));

    for (const item of bullets) {
      const text = item.textContent.trim();
      if (text.length > 10 && text.length < 200 && !text.includes('\n\n')) {
        features.push(text);
      }
    }

    return features;
  }

  looksLikeProductPage() {
    return !!document.querySelector('[itemtype*="Product"], [class*="product-detail"], #product');
  }

  getListName(ul) {
    const prev = ul.previousElementSibling;
    if (prev && /^h[1-6]$/i.test(prev.tagName)) {
      return prev.textContent.trim();
    }
    return ul.getAttribute('aria-label') || 'Navigation';
  }

  extractCardPreview(card) {
    const title = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"]');
    const image = card.querySelector('img');

    return {
      title: title ? title.textContent.trim().substring(0, 60) : null,
      has_image: !!image
    };
  }

  formatAsRegionsYAML(result) {
    const lines = [];

    lines.push('PAGE:');

    for (const region of result.regions) {
      lines.push(`  ${region.id}:`);
      lines.push(`    type: ${region.kind}`);

      if (region.title) {
        lines.push(`    title: "${region.title}"`);
      }

      if (region.nav_lists) {
        lines.push(`    nav_lists:`);
        for (const list of region.nav_lists) {
          lines.push(`      - name: "${list.name}"`);
          lines.push(`        count: ${list.count}`);
          if (list.items.length > 0) {
            lines.push(`        items: [${list.items.slice(0, 3).map(i => `"${i}"`).join(', ')}]`);
          }
        }
      }

      if (region.card_grids) {
        lines.push(`    card_grids:`);
        for (const grid of region.card_grids) {
          lines.push(`      - type: ${grid.type}`);
          lines.push(`        count: ${grid.count}`);
        }
      }

      if (region.price_blocks) {
        lines.push(`    price_blocks:`);
        for (const block of region.price_blocks.slice(0, 3)) {
          lines.push(`      - "${block.text}"`);
        }
      }

      if (region.feature_list) {
        lines.push(`    features:`);
        for (const feature of region.feature_list.slice(0, 3)) {
          lines.push(`      - "${feature}"`);
        }
      }

      if (region.description) {
        lines.push(`    text: "${region.description}"`);
      }
    }

    // Add links section
    if (result.links.length > 0) {
      lines.push('');
      lines.push('QUICK_LINKS:');
      for (const link of result.links.slice(0, 20)) {
        lines.push(`  ${link.id}: "${link.text}" → ${link.href.substring(0, 60)}`);
      }
    }

    return lines.join('\n');
  }
