import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Categories domain logic simulation
class MockCategoryService {
  constructor() {
    this.categories = new Map();
    this.products = new Map();
  }

  saveCategory(cat) {
    if (!cat || !cat.name || !cat.name.trim()) {
      throw new Error('اسم التصنيف مطلوب ولا يمكن أن يكون فارغاً');
    }
    const name = cat.name.trim();

    // Check duplicate name
    for (const existing of this.categories.values()) {
      if (existing.name.toLowerCase() === name.toLowerCase() && existing.id !== cat.id) {
        throw new Error(`يوجد تصنيف مسجل بالفعل بهذا الاسم: ${name}`);
      }
    }

    const id = cat.id || `cat_${Math.random()}`;
    const saved = {
      id,
      name,
      displayOrder: cat.displayOrder !== undefined ? cat.displayOrder : this.categories.size,
      isActive: cat.isActive !== undefined ? cat.isActive : true,
      createdAt: cat.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.categories.set(id, saved);
    return saved;
  }

  archiveCategory(id, isArchived = true) {
    const cat = this.categories.get(id);
    if (!cat) throw new Error('Category not found');
    cat.isActive = !isArchived;
    return cat;
  }

  reorder(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      const cat = this.categories.get(orderedIds[i]);
      if (cat) cat.displayOrder = i;
    }
  }

  getAll(includeArchived = false) {
    return Array.from(this.categories.values())
      .filter(c => includeArchived || c.isActive)
      .map(c => {
        // Count active products in this category
        const count = Array.from(this.products.values()).filter(p => p.categoryId === c.id && p.isActive).length;
        return { ...c, productCount: count };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  addProduct(prod) {
    this.products.set(prod.id, { ...prod, isActive: true });
  }

  filterProductsByCategory(catId) {
    const all = Array.from(this.products.values()).filter(p => p.isActive);
    if (!catId || catId === 'all') return all;
    return all.filter(p => p.categoryId === catId);
  }
}

describe('Rafiq POS Product Categories Management Test Suite (Feature #16 / Tasks 16-1, 16-2, 16-3)', () => {
  it('adds categories with unique names and rejects empty names (Task 16-1 & 16-2)', () => {
    const service = new MockCategoryService();

    assert.throws(
      () => service.saveCategory({ name: '   ' }),
      /اسم التصنيف مطلوب/
    );

    const c1 = service.saveCategory({ name: 'ألبان وأجبان' });
    assert.equal(c1.name, 'ألبان وأجبان');
    assert.equal(c1.isActive, true);

    // Reject duplicate name
    assert.throws(
      () => service.saveCategory({ name: 'ألبان وأجبان' }),
      /يوجد تصنيف مسجل بالفعل/
    );
  });

  it('allows renaming existing category without self-conflict (Task 16-2)', () => {
    const service = new MockCategoryService();
    const c = service.saveCategory({ name: 'مشروبات' });

    const updated = service.saveCategory({ id: c.id, name: 'مشروبات وعصائر' });
    assert.equal(updated.name, 'مشروبات وعصائر');
  });

  it('supports archiving category and hiding it from active list (Task 16-2)', () => {
    const service = new MockCategoryService();
    const c1 = service.saveCategory({ name: 'منتجات موسمية' });
    service.saveCategory({ name: 'بقوليات' });

    assert.equal(service.getAll(false).length, 2);

    // Archive c1
    service.archiveCategory(c1.id, true);

    // Active list only has 1
    const activeList = service.getAll(false);
    assert.equal(activeList.length, 1);
    assert.equal(activeList[0].name, 'بقوليات');

    // With includeArchived=true has 2
    assert.equal(service.getAll(true).length, 2);
  });

  it('supports reordering categories and preserves custom display order (Task 16-2)', () => {
    const service = new MockCategoryService();
    const c1 = service.saveCategory({ name: 'أول' });
    const c2 = service.saveCategory({ name: 'ثان' });
    const c3 = service.saveCategory({ name: 'ثالث' });

    // Reverse order
    service.reorder([c3.id, c2.id, c1.id]);

    const ordered = service.getAll();
    assert.equal(ordered[0].name, 'ثالث');
    assert.equal(ordered[1].name, 'ثان');
    assert.equal(ordered[2].name, 'أول');
  });

  it('accurately counts products per category and filters products in UI (Task 16-3)', () => {
    const service = new MockCategoryService();
    const dairy = service.saveCategory({ id: 'cat_dairy', name: 'ألبان' });
    const snacks = service.saveCategory({ id: 'cat_snacks', name: 'حلويات' });

    service.addProduct({ id: 'p1', name: 'جبنة بيضاء', categoryId: dairy.id });
    service.addProduct({ id: 'p2', name: 'زبادي طبيعي', categoryId: dairy.id });
    service.addProduct({ id: 'p3', name: 'شوكولاتة', categoryId: snacks.id });

    const cats = service.getAll();
    const dairyCat = cats.find(c => c.id === dairy.id);
    const snacksCat = cats.find(c => c.id === snacks.id);

    assert.equal(dairyCat.productCount, 2);
    assert.equal(snacksCat.productCount, 1);

    // Filter by dairy
    const dairyProducts = service.filterProductsByCategory(dairy.id);
    assert.equal(dairyProducts.length, 2);
    assert.ok(dairyProducts.some(p => p.name === 'جبنة بيضاء'));

    // Filter by 'all'
    assert.equal(service.filterProductsByCategory('all').length, 3);
  });
});
