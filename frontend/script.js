// ========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ========================================
const API_URL = window.location.origin;
let currentCategory = 'Все';
let currentPage = 0;
const LIMIT = 20;
let isLoading = false;
let hasMore = true;
let cartItems = [];
let currentProductId = null;
let appliedPromo = null;
let selectedProductIds = [];
let adminTab = 'dashboard';

// ========== АДМИНЫ ==========
const ADMIN_IDS = [1886614664, 8814572765];

// Telegram WebApp
const tg = window.Telegram?.WebApp || {
    initDataUnsafe: { user: { id: 0 } },
    close: () => {},
    ready: () => {}
};

// Определяем user_id
const USER_ID = tg.initDataUnsafe?.user?.id || 1886614664;
const USERNAME = tg.initDataUnsafe?.user?.username || 'guest';

// ========================================
// DOM ЭЛЕМЕНТЫ
// ========================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Главная ---
const productsGrid = $('productsGrid');
const skeletonGrid = $('skeletonGrid');
const emptyState = $('emptyState');
const loadMoreContainer = $('loadMoreContainer');
const loadMoreBtn = $('loadMoreBtn');
const categoriesContainer = $('categoriesContainer');
const searchInput = $('searchInput');
const searchToggle = $('searchToggle');
const searchContainer = $('searchContainer');
const searchClear = $('searchClear');

// --- Корзина ---
const cartBtn = $('cartBtn');
const cartBadge = $('cartBadge');
const cartPanel = $('cartPanel');
const cartOverlay = $('cartOverlay');
const cartClose = $('cartClose');
const cartBody = $('cartBody');
const cartItemsContainer = $('cartItems');
const cartFooter = $('cartFooter');
const cartTotal = $('cartTotal');
const checkoutBtn = $('checkoutBtn');

// --- Модалка товара ---
const modalOverlay = $('modalOverlay');
const modalContainer = $('modalContainer');
const modalClose = $('modalClose');
const modalContent = $('modalContent');

// --- Модалка заказа ---
const orderModalOverlay = $('orderModalOverlay');
const orderModalClose = $('orderModalClose');
const orderForm = $('orderForm');
const orderSuccess = $('orderSuccess');
const orderNumberText = $('orderNumberText');
const orderCloseBtn = $('orderCloseBtn');
const orderPhone = $('orderPhone');
const orderAddress = $('orderAddress');
const orderComment = $('orderComment');
const orderPromo = $('orderPromo');
const promoApplyBtn = $('promoApplyBtn');
const promoInfo = $('promoInfo');
const orderSubtotal = $('orderSubtotal');
const orderDiscount = $('orderDiscount');
const discountRow = $('discountRow');
const orderTotal = $('orderTotal');
const submitOrderBtn = $('submitOrderBtn');

// --- Toast ---
const toast = $('toast');

// ========================================
// TOAST УВЕДОМЛЕНИЯ
// ========================================
let toastTimeout = null;

function showToast(message, type = 'info', duration = 3000) {
    toast.textContent = message;
    toast.className = 'toast ' + type;
    void toast.offsetWidth;
    toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// ========================================
// API ЗАПРОСЫ
// ========================================
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка запроса');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message || 'Ошибка соединения', 'error');
        throw error;
    }
}

// ========================================
// ПРОВЕРКА АДМИНА
// ========================================
function isAdmin() {
    return ADMIN_IDS.includes(USER_ID);
}

function showAdminButton() {
    const btn = document.getElementById('adminBtn');
    if (btn && isAdmin()) {
        btn.style.display = 'flex';
    }
}

// ========================================
// ЗАГРУЗКА КАТЕГОРИЙ
// ========================================
async function loadCategories() {
    try {
        const categories = await apiRequest('/api/categories');
        
        categoriesContainer.innerHTML = '';
        
        const allBtn = document.createElement('button');
        allBtn.className = 'category-btn active';
        allBtn.dataset.category = 'Все';
        allBtn.textContent = 'Все';
        allBtn.onclick = () => selectCategory('Все');
        categoriesContainer.appendChild(allBtn);
        
        categories.forEach(cat => {
            if (cat.name !== 'Все') {
                const btn = document.createElement('button');
                btn.className = 'category-btn';
                btn.dataset.category = cat.name;
                btn.textContent = cat.icon ? `${cat.icon} ${cat.name}` : cat.name;
                btn.onclick = () => selectCategory(cat.name);
                categoriesContainer.appendChild(btn);
            }
        });
        
        // Заполняем select в админке
        const adminCategoryFilter = $('adminCategoryFilter');
        const productCategory = $('productCategory');
        if (adminCategoryFilter) {
            adminCategoryFilter.innerHTML = '<option value="Все">Все категории</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                adminCategoryFilter.appendChild(opt);
            });
        }
        if (productCategory) {
            productCategory.innerHTML = '';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                productCategory.appendChild(opt);
            });
        }
        
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

// ========================================
// ВЫБОР КАТЕГОРИИ
// ========================================
function selectCategory(category) {
    currentCategory = category;
    currentPage = 0;
    hasMore = true;
    productsGrid.innerHTML = '';
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    loadProducts(true);
}

// ========================================
// ЗАГРУЗКА ТОВАРОВ
// ========================================
async function loadProducts(reset = false) {
    if (isLoading) return;
    if (!hasMore && !reset) return;
    
    isLoading = true;
    
    if (reset) {
        currentPage = 0;
        hasMore = true;
        productsGrid.innerHTML = '';
        skeletonGrid.classList.remove('hidden');
    }
    
    try {
        const searchQuery = searchInput.value.trim();
        let url = `/api/products?limit=${LIMIT}&offset=${currentPage * LIMIT}`;
        
        if (currentCategory && currentCategory !== 'Все') {
            url += `&category=${encodeURIComponent(currentCategory)}`;
        }
        
        if (searchQuery) {
            url += `&search=${encodeURIComponent(searchQuery)}`;
        }
        
        const data = await apiRequest(url);
        
        skeletonGrid.classList.add('hidden');
        
        if (data.products.length === 0 && currentPage === 0) {
            emptyState.style.display = 'flex';
            productsGrid.classList.add('empty');
            loadMoreContainer.style.display = 'none';
            return;
        }
        
        emptyState.style.display = 'none';
        productsGrid.classList.remove('empty');
        
        data.products.forEach(product => {
            productsGrid.appendChild(createProductCard(product));
        });
        
        currentPage++;
        hasMore = data.products.length === LIMIT;
        loadMoreContainer.style.display = hasMore ? 'flex' : 'none';
        
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        skeletonGrid.classList.add('hidden');
        showToast('Не удалось загрузить товары', 'error');
    } finally {
        isLoading = false;
    }
}

// ========================================
// СОЗДАНИЕ КАРТОЧКИ ТОВАРА
// ========================================
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;
    
    const inStock = product.quantity > 0;
    const statusText = inStock ? `✅ В наличии (${product.quantity} шт)` : '❌ Нет в наличии';
    const statusClass = inStock ? 'product-status' : 'product-status out-of-stock';
    
    card.innerHTML = `
        <div class="product-image" onclick="openProduct(${product.id})">
            ${product.photo ? `<img src="${product.photo}" alt="${product.name}" loading="lazy">` : `<span class="placeholder-icon"><i class="fas fa-tshirt"></i></span>`}
            <span class="product-id-badge">🆔 #${product.id}</span>
            <button class="product-share-btn" onclick="event.stopPropagation(); shareProduct(${product.id})">
                <i class="fas fa-share-alt"></i>
            </button>
        </div>
        <div class="product-info">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-price">${product.price} <small>BYN</small></div>
            <div class="${statusClass}">${statusText}</div>
            <div class="product-actions">
                <button class="product-action-btn btn-cart" onclick="event.stopPropagation(); addToCart(${product.id})">
                    <i class="fas fa-shopping-cart"></i>
                </button>
                <button class="product-action-btn btn-buy" onclick="event.stopPropagation(); buyNow(${product.id})">
                    <i class="fas fa-bolt"></i> Купить
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// ========================================
// ОТКРЫТИЕ КАРТОЧКИ ТОВАРА
// ========================================
async function openProduct(productId) {
    try {
        const product = await apiRequest(`/api/products/${productId}`);
        currentProductId = productId;
        renderProductModal(product);
        modalOverlay.classList.add('open');
    } catch (error) {
        showToast('Не удалось загрузить товар', 'error');
    }
}

function renderProductModal(product) {
    const inStock = product.quantity > 0;
    const statusText = inStock ? `✅ В наличии (${product.quantity} шт)` : '❌ Нет в наличии';
    const statusClass = inStock ? 'modal-product-status' : 'modal-product-status out-of-stock';
    
    modalContent.innerHTML = `
        <div class="modal-product-id">🆔 #${product.id}</div>
        <div class="modal-product-image">
            ${product.photo ? `<img src="${product.photo}" alt="${product.name}">` : `<i class="fas fa-tshirt" style="font-size:60px;opacity:0.3;"></i>`}
        </div>
        <div class="modal-product-name">${escapeHtml(product.name)}</div>
        <div class="modal-product-price">${product.price} BYN</div>
        <div class="${statusClass}">${statusText}</div>
        ${product.note ? `<div class="modal-product-note">📌 ${escapeHtml(product.note)}</div>` : ''}
        <div class="modal-actions">
            <button class="product-action-btn btn-cart" onclick="addToCart(${product.id}); closeModal();">
                <i class="fas fa-shopping-cart"></i> В корзину
            </button>
            <button class="product-action-btn btn-buy" onclick="buyNow(${product.id}); closeModal();">
                <i class="fas fa-bolt"></i> Купить
            </button>
        </div>
    `;
}

function closeModal() {
    modalOverlay.classList.remove('open');
}

// ========================================
// ПОДЕЛИТЬСЯ
// ========================================
function shareProduct(productId) {
    const shareUrl = `${window.location.origin}?start=product_${productId}`;
    const text = `🔥 Смотри, что нашел в FAKESHOP! 🛍️\n\nПереходи по ссылке: ${shareUrl}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'FAKESHOP - Товар',
            text: text,
            url: shareUrl
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('🔗 Ссылка скопирована! Отправь другу', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('🔗 Ссылка скопирована!', 'success');
        });
    }
}

// ========================================
// КОРЗИНА
// ========================================
async function addToCart(productId, quantity = 1) {
    try {
        await apiRequest(`/api/cart/${USER_ID}`, {
            method: 'POST',
            body: JSON.stringify({ product_id: productId, quantity })
        });
        await loadCart();
        showToast('✅ Товар добавлен в корзину', 'success');
    } catch (error) {
        showToast(error.message || 'Ошибка добавления в корзину', 'error');
    }
}

async function loadCart() {
    try {
        const data = await apiRequest(`/api/cart/${USER_ID}`);
        cartItems = data.items || [];
        updateCartUI();
        return data;
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        return { items: [], total: 0 };
    }
}

function updateCartUI() {
    const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    cartBadge.textContent = count;
    cartBadge.style.display = count > 0 ? 'flex' : 'none';
    
    if (cartItems.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="cart-empty">
                <i class="fas fa-shopping-basket"></i>
                <p>Корзина пуста</p>
            </div>
        `;
        cartFooter.style.display = 'none';
        return;
    }
    
    let total = 0;
    cartItemsContainer.innerHTML = cartItems.map(item => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        return `
            <div class="cart-item" data-product-id="${item.product_id}">
                <div class="cart-item-image">
                    ${item.photo ? `<img src="${item.photo}" alt="${item.name}">` : `<i class="fas fa-tshirt"></i>`}
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${item.price} BYN</div>
                    <div class="cart-item-qty">
                        <button onclick="updateCartQty(${item.product_id}, -1)">−</button>
                        <span>${item.quantity}</span>
                        <button onclick="updateCartQty(${item.product_id}, 1)">+</button>
                    </div>
                </div>
                <button class="cart-item-remove" onclick="removeFromCart(${item.product_id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }).join('');
    
    cartTotal.textContent = `${total} BYN`;
    cartFooter.style.display = 'block';
}

async function updateCartQty(productId, delta) {
    const item = cartItems.find(i => i.product_id === productId);
    if (!item) return;
    
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        await removeFromCart(productId);
        return;
    }
    
    try {
        await apiRequest(`/api/cart/${USER_ID}/${productId}`, {
            method: 'DELETE'
        });
        await apiRequest(`/api/cart/${USER_ID}`, {
            method: 'POST',
            body: JSON.stringify({ product_id: productId, quantity: newQty })
        });
        await loadCart();
    } catch (error) {
        showToast('Ошибка обновления корзины', 'error');
    }
}

async function removeFromCart(productId) {
    try {
        await apiRequest(`/api/cart/${USER_ID}/${productId}`, {
            method: 'DELETE'
        });
        await loadCart();
        showToast('🗑️ Товар удален из корзины', 'info');
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

function openCart() {
    cartPanel.classList.add('open');
    cartOverlay.classList.add('open');
}

function closeCart() {
    cartPanel.classList.remove('open');
    cartOverlay.classList.remove('open');
}

// ========================================
// ПОКУПКА СРАЗУ
// ========================================
async function buyNow(productId) {
    if (!confirm('⚡ Вы точно хотите купить этот товар?')) return;
    
    try {
        const product = await apiRequest(`/api/products/${productId}`);
        if (product.quantity <= 0) {
            showToast('❌ Товара нет в наличии', 'error');
            return;
        }
        
        selectedProductIds = [productId];
        openOrderForm();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

// ========================================
// ОФОРМЛЕНИЕ ЗАКАЗА
// ========================================
function checkoutFromCart() {
    if (cartItems.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }
    
    selectedProductIds = cartItems.map(item => item.product_id);
    closeCart();
    openOrderForm();
}

function openOrderForm() {
    orderForm.style.display = 'block';
    orderSuccess.style.display = 'none';
    orderModalOverlay.classList.add('open');
    updateOrderSummary();
}

function closeOrderModal() {
    orderModalOverlay.classList.remove('open');
    appliedPromo = null;
    promoInfo.textContent = '';
    promoInfo.className = 'promo-info';
    orderPromo.value = '';
}

// ========================================
// ОБНОВЛЕНИЕ СУММЫ ЗАКАЗА
// ========================================
async function updateOrderSummary() {
    try {
        let total = 0;
        for (const pid of selectedProductIds) {
            const product = await apiRequest(`/api/products/${pid}`);
            total += product.price;
        }
        
        orderSubtotal.textContent = `${total} BYN`;
        
        let finalTotal = total;
        let discountAmount = 0;
        
        if (appliedPromo) {
            discountAmount = (total * appliedPromo.discount) / 100;
            finalTotal = total - discountAmount;
            discountRow.style.display = 'flex';
            orderDiscount.textContent = `-${discountAmount.toFixed(2)} BYN`;
        } else {
            discountRow.style.display = 'none';
        }
        
        orderTotal.textContent = `${finalTotal.toFixed(2)} BYN`;
    } catch (error) {
        console.error('Ошибка обновления суммы:', error);
    }
}

// ========================================
// ПРИМЕНЕНИЕ ПРОМОКОДА
// ========================================
async function applyPromo() {
    const code = orderPromo.value.trim().toUpperCase();
    if (!code) {
        showToast('Введите промокод', 'error');
        return;
    }
    
    try {
        const total = parseFloat(orderSubtotal.textContent);
        const data = await apiRequest(`/api/promocodes/${code}/validate?total=${total}`, {
            method: 'POST'
        });
        
        appliedPromo = data;
        promoInfo.textContent = `✅ Промокод применен! Скидка ${data.discount}%`;
        promoInfo.className = 'promo-info';
        await updateOrderSummary();
        showToast('🎉 Промокод применен!', 'success');
    } catch (error) {
        promoInfo.textContent = `❌ ${error.message}`;
        promoInfo.className = 'promo-info error';
        appliedPromo = null;
    }
}

// ========================================
// ОТПРАВКА ЗАКАЗА
// ========================================
async function submitOrder() {
    const phone = orderPhone.value.trim();
    if (!phone) {
        showToast('Введите номер телефона', 'error');
        return;
    }
    
    if (selectedProductIds.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }
    
    const orderData = {
        user_id: USER_ID,
        username: USERNAME,
        first_name: tg.initDataUnsafe?.user?.first_name || '',
        last_name: tg.initDataUnsafe?.user?.last_name || '',
        phone: phone,
        address: orderAddress.value.trim(),
        contact: `@${USERNAME}`,
        promocode: appliedPromo ? appliedPromo.code : '',
        comment: orderComment.value.trim()
    };
    
    try {
        const result = await apiRequest('/api/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        orderForm.style.display = 'none';
        orderSuccess.style.display = 'block';
        orderNumberText.innerHTML = `Номер заказа: <strong>${result.order_number || '#' + result.order_id}</strong>`;
        
        await loadCart();
        showToast('✅ Заказ оформлен! Менеджер свяжется с вами', 'success');
        
    } catch (error) {
        showToast(error.message || 'Ошибка оформления заказа', 'error');
    }
}

// ========================================
// ПОИСК
// ========================================
function toggleSearch() {
    searchContainer.classList.toggle('open');
    if (searchContainer.classList.contains('open')) {
        searchInput.focus();
    }
}

function clearSearch() {
    searchInput.value = '';
    searchContainer.classList.remove('open');
    currentPage = 0;
    hasMore = true;
    productsGrid.innerHTML = '';
    loadProducts(true);
}

// ========================================
// ЗАГРУЗКА ЕЩЕ
// ========================================
function loadMore() {
    loadProducts();
}

// ========================================
// ESCAPE HTML
// ========================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// АДМИН-ПАНЕЛЬ
// ========================================
function switchTab(tab) {
    adminTab = tab;
    
    document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-nav-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tab}`);
    if (targetTab) targetTab.classList.add('active');
    
    const targetBtn = document.querySelector(`.admin-nav-btn[data-tab="${tab}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    
    switch (tab) {
        case 'dashboard': loadDashboard(); break;
        case 'products': loadAdminProducts(); break;
        case 'categories': loadAdminCategories(); break;
        case 'orders': loadAdminOrders(); break;
        case 'promocodes': loadPromoCodes(); break;
        case 'faq': loadFaq(); break;
        case 'banned': loadBannedUsers(); break;
        case 'settings': loadSettings(); break;
        case 'reviews': loadAdminReviews(); break;
    }
}

// ========================================
// ДАШБОРД
// ========================================
async function loadDashboard() {
    try {
        const stats = await apiRequest('/api/stats');
        const elements = {
            statProducts: stats.total_products || 0,
            statOrders: stats.total_orders || 0,
            statRevenue: `${stats.total_revenue || 0} BYN`,
            statUsers: stats.total_users || 0,
            statTodayOrders: stats.today_orders || 0
        };
        Object.keys(elements).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = elements[id];
        });
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ========================================
// АДМИН: ТОВАРЫ
// ========================================
async function loadAdminProducts() {
    const list = document.getElementById('adminProductsList');
    if (!list) return;
    list.innerHTML = '<div class="skeleton-card" style="height:60px;"></div>';
    
    try {
        const search = document.getElementById('adminSearchInput')?.value || '';
        const category = document.getElementById('adminCategoryFilter')?.value || 'Все';
        let url = '/api/products?limit=100';
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (category && category !== 'Все') url += `&category=${encodeURIComponent(category)}`;
        
        const data = await apiRequest(url);
        const products = data.products || [];
        
        if (products.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Товаров не найдено</p></div>';
            return;
        }
        
        list.innerHTML = products.map(p => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">🆔 #${p.id} ${escapeHtml(p.name)}</div>
                    <div class="list-item-sub">
                        ${p.price} BYN · ${p.quantity} шт · ${p.category || 'Все'}
                        ${p.quantity > 0 ? '✅' : '❌'}
                        ${p.from_china ? '🌏 Из Китая' : ''}
                    </div>
                </div>
                <div class="list-item-actions">
                    <button class="view-btn" onclick="openProduct(${p.id})" title="Карточка"><i class="fas fa-eye"></i></button>
                    <button class="edit-btn" onclick="editProduct(${p.id})" title="Изменить"><i class="fas fa-pen"></i></button>
                    <button class="delete-btn" onclick="deleteProduct(${p.id})" title="Удалить"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function toggleProductForm() {
    const container = document.getElementById('productFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    if (container.style.display === 'block') {
        document.getElementById('productFormTitle').textContent = '➕ Новый товар';
        document.getElementById('productName').value = '';
        document.getElementById('productPrice').value = '';
        document.getElementById('productQuantity').value = '';
        document.getElementById('productCategory').value = 'Все';
        document.getElementById('productPhoto').value = '';
        document.getElementById('productNote').value = '';
        const chinaCheck = document.getElementById('productFromChina');
        if (chinaCheck) chinaCheck.checked = false;
        document.getElementById('productFormSubmit').dataset.productId = '';
        document.getElementById('productFormSubmit').textContent = '✅ Сохранить';
    }
}

async function saveProduct() {
    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const quantity = parseInt(document.getElementById('productQuantity').value);
    const category = document.getElementById('productCategory').value;
    const photo = document.getElementById('productPhoto').value.trim();
    const note = document.getElementById('productNote').value.trim();
    const fromChina = document.getElementById('productFromChina')?.checked ? 1 : 0;
    const editId = document.getElementById('productFormSubmit').dataset.productId;
    
    if (!name || isNaN(price) || isNaN(quantity)) {
        showToast('Заполните обязательные поля', 'error');
        return;
    }
    
    const data = { name, price, quantity, category, photo, note, from_china: fromChina };
    
    try {
        if (editId) {
            await apiRequest(`/api/products/${editId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            showToast('✅ Товар обновлен', 'success');
        } else {
            await apiRequest('/api/products', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showToast('✅ Товар создан', 'success');
        }
        
        toggleProductForm();
        loadAdminProducts();
        loadProducts(true);
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения', 'error');
    }
}

async function editProduct(id) {
    try {
        const product = await apiRequest(`/api/products/${id}`);
        toggleProductForm();
        document.getElementById('productFormTitle').textContent = '✏️ Редактировать товар';
        document.getElementById('productName').value = product.name;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productQuantity').value = product.quantity;
        document.getElementById('productCategory').value = product.category || 'Все';
        document.getElementById('productPhoto').value = product.photo || '';
        document.getElementById('productNote').value = product.note || '';
        const chinaCheck = document.getElementById('productFromChina');
        if (chinaCheck) chinaCheck.checked = product.from_china == 1;
        document.getElementById('productFormSubmit').dataset.productId = id;
        document.getElementById('productFormSubmit').textContent = '💾 Обновить';
    } catch (error) {
        showToast('Ошибка загрузки товара', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('🗑️ Точно удалить товар #' + id + '?')) return;
    try {
        await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
        showToast('🗑️ Товар удален', 'info');
        loadAdminProducts();
        loadProducts(true);
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

// ========================================
// АДМИН: КАТЕГОРИИ
// ========================================
async function loadAdminCategories() {
    const list = document.getElementById('adminCategoriesList');
    if (!list) return;
    list.innerHTML = '<div class="skeleton-card" style="height:40px;"></div>';
    
    try {
        const categories = await apiRequest('/api/categories');
        if (categories.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Категорий нет</p></div>';
            return;
        }
        list.innerHTML = categories.map(c => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">${c.icon || '📁'} ${c.name}</div>
                    <div class="list-item-sub">ID: ${c.id} · ${c.name !== 'Все' ? 'Можно удалить' : 'Системная'}</div>
                </div>
                ${c.name !== 'Все' ? `
                <div class="list-item-actions">
                    <button class="edit-btn" onclick="editCategory(${c.id}, '${c.name}', '${c.icon || ''}')"><i class="fas fa-pen"></i></button>
                    <button class="delete-btn" onclick="deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
                </div>
                ` : `<span class="status-badge completed">Системная</span>`}
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function toggleCategoryForm() {
    const container = document.getElementById('categoryFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    if (container.style.display === 'block') {
        document.getElementById('categoryName').value = '';
        document.getElementById('categoryIcon').value = '';
        document.getElementById('categoryFormSubmit').dataset.categoryId = '';
        document.getElementById('categoryFormSubmit').textContent = '✅ Сохранить';
    }
}

async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const icon = document.getElementById('categoryIcon').value.trim();
    const editId = document.getElementById('categoryFormSubmit').dataset.categoryId;
    
    if (!name) {
        showToast('Введите название категории', 'error');
        return;
    }
    
    try {
        if (editId) {
            await apiRequest(`/api/categories/${editId}`, {
                method: 'PUT',
                body: JSON.stringify({ name, icon, user_id: USER_ID })
            });
            showToast('✅ Категория обновлена', 'success');
        } else {
            await apiRequest('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name, icon, user_id: USER_ID })
            });
            showToast('✅ Категория создана', 'success');
        }
        toggleCategoryForm();
        loadAdminCategories();
        loadCategories();
    } catch (error) {
        showToast(error.message || 'Ошибка', 'error');
    }
}

function editCategory(id, name, icon) {
    toggleCategoryForm();
    document.getElementById('categoryName').value = name;
    document.getElementById('categoryIcon').value = icon;
    document.getElementById('categoryFormSubmit').dataset.categoryId = id;
    document.getElementById('categoryFormSubmit').textContent = '💾 Обновить';
}

async function deleteCategory(id) {
    if (!confirm('🗑️ Удалить категорию? Товары перенесутся в "Все".')) return;
    try {
        await apiRequest(`/api/categories/${id}?user_id=${USER_ID}`, { method: 'DELETE' });
        showToast('🗑️ Категория удалена', 'info');
        loadAdminCategories();
        loadCategories();
    } catch (error) {
        showToast(error.message || 'Ошибка удаления', 'error');
    }
}

// ========================================
// АДМИН: ЗАЯВКИ
// ========================================
async function loadAdminOrders() {
    const list = document.getElementById('adminOrdersList');
    if (!list) return;
    list.innerHTML = '<div class="skeleton-card" style="height:60px;"></div>';
    
    try {
        const status = document.getElementById('orderStatusFilter')?.value || 'all';
        let url = '/api/orders?limit=100';
        if (status !== 'all') url += `&status=${status}`;
        
        const orders = await apiRequest(url);
        
        if (orders.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Заявок нет</p></div>';
            return;
        }
        
        list.innerHTML = orders.map(o => {
            const statusMap = {
                'new': '🟢 Новый',
                'processing': '🟡 В обработке',
                'completed': '✅ Завершен',
                'cancelled': '❌ Отменен'
            };
            const productIds = o.product_ids ? o.product_ids.split(',').join(', ') : '-';
            return `
                <div class="list-item">
                    <div class="list-item-info">
                        <div class="list-item-title">📦 ${o.order_number || '#' + o.id}</div>
                        <div class="list-item-sub">
                            👤 ${o.username || o.first_name || 'Гость'} · 📞 ${o.phone || '-'}
                        </div>
                        <div class="list-item-sub">
                            🆔 ${productIds} · 💰 ${o.final_total || o.total} BYN
                        </div>
                        <div class="list-item-sub">
                            <span class="status-badge ${o.status}">${statusMap[o.status] || o.status}</span>
                            ${o.created_at ? new Date(o.created_at).toLocaleString() : ''}
                        </div>
                    </div>
                    <div class="list-item-actions">
                        ${o.status !== 'completed' && o.status !== 'cancelled' ? `
                            <button class="edit-btn" onclick="completeOrder(${o.id})" title="Обработано">✅</button>
                        ` : ''}
                        <button class="delete-btn" onclick="deleteOrder(${o.id})" title="Удалить"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

async function completeOrder(id) {
    if (!confirm('✅ Отметить заказ #' + id + ' как обработанный? Он будет удален.')) return;
    try {
        await apiRequest(`/api/orders/${id}`, { method: 'DELETE' });
        showToast('✅ Заказ обработан и удален', 'success');
        loadAdminOrders();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

async function deleteOrder(id) {
    if (!confirm('🗑️ Удалить заявку #' + id + '?')) return;
    try {
        await apiRequest(`/api/orders/${id}`, { method: 'DELETE' });
        showToast('🗑️ Заявка удалена', 'info');
        loadAdminOrders();
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

// ========================================
// АДМИН: ПРОМОКОДЫ
// ========================================
async function loadPromoCodes() {
    const list = document.getElementById('adminPromoCodes');
    if (!list) return;
    try {
        const data = await apiRequest('/api/promocodes');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Промокодов нет</p></div>';
            return;
        }
        list.innerHTML = data.map(p => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">🏷️ ${p.code}</div>
                    <div class="list-item-sub">Скидка ${p.discount}% · Использован ${p.used_count || 0}/${p.uses_limit || '∞'} раз</div>
                </div>
                <div class="list-item-actions">
                    <button class="delete-btn" onclick="deletePromo('${p.code}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function togglePromoForm() {
    const container = document.getElementById('promoFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

async function savePromo() {
    const code = document.getElementById('promoCode').value.trim().toUpperCase();
    const discount = parseInt(document.getElementById('promoDiscount').value);
    const min_order = parseFloat(document.getElementById('promoMinOrder').value) || 0;
    const uses_limit = parseInt(document.getElementById('promoUsesLimit').value) || 0;
    const expires_at = document.getElementById('promoExpiresAt').value || null;
    
    if (!code || isNaN(discount)) {
        showToast('Заполните код и скидку', 'error');
        return;
    }
    
    try {
        await apiRequest('/api/promocodes', {
            method: 'POST',
            body: JSON.stringify({ code, discount, min_order, uses_limit, expires_at })
        });
        showToast('✅ Промокод создан', 'success');
        togglePromoForm();
        loadPromoCodes();
    } catch (error) {
        showToast(error.message || 'Ошибка', 'error');
    }
}

async function deletePromo(code) {
    if (!confirm(`Удалить промокод ${code}?`)) return;
    try {
        await apiRequest(`/api/promocodes/${code}`, { method: 'DELETE' });
        showToast('🗑️ Промокод удален', 'info');
        loadPromoCodes();
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

// ========================================
// АДМИН: FAQ
// ========================================
async function loadFaq() {
    const list = document.getElementById('adminFaqList');
    if (!list) return;
    try {
        const data = await apiRequest('/api/faq');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>FAQ пуст</p></div>';
            return;
        }
        list.innerHTML = data.map(f => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">❓ ${escapeHtml(f.question)}</div>
                    <div class="list-item-sub">${escapeHtml(f.answer)}</div>
                </div>
                <div class="list-item-actions">
                    <button class="delete-btn" onclick="deleteFaq(${f.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function toggleFaqForm() {
    const container = document.getElementById('faqFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

async function saveFaq() {
    const question = document.getElementById('faqQuestion').value.trim();
    const answer = document.getElementById('faqAnswer').value.trim();
    
    if (!question || !answer) {
        showToast('Заполните вопрос и ответ', 'error');
        return;
    }
    
    try {
        await apiRequest('/api/faq', {
            method: 'POST',
            body: JSON.stringify({ question, answer })
        });
        showToast('✅ FAQ добавлен', 'success');
        toggleFaqForm();
        loadFaq();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

async function deleteFaq(id) {
    if (!confirm('Удалить FAQ?')) return;
    try {
        await apiRequest(`/api/faq/${id}`, { method: 'DELETE' });
        showToast('🗑️ FAQ удален', 'info');
        loadFaq();
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

// ========================================
// АДМИН: БАН-ЛИСТ
// ========================================
async function loadBannedUsers() {
    const list = document.getElementById('adminBannedList');
    if (!list) return;
    try {
        const data = await apiRequest('/api/banned');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Забаненных нет</p></div>';
            return;
        }
        list.innerHTML = data.map(b => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">🚫 ${b.user_id}</div>
                    <div class="list-item-sub">${b.reason || 'Без причины'} · ${b.banned_at ? new Date(b.banned_at).toLocaleString() : ''}</div>
                </div>
                <div class="list-item-actions">
                    <button class="edit-btn" onclick="unbanUser(${b.user_id})"><i class="fas fa-check"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

async function banUser() {
    const userId = parseInt(document.getElementById('banUserId').value);
    const reason = document.getElementById('banReason').value.trim() || 'Нарушение правил';
    
    if (!userId) {
        showToast('Введите ID пользователя', 'error');
        return;
    }
    
    try {
        await apiRequest(`/api/banned/${userId}?reason=${encodeURIComponent(reason)}`, {
            method: 'POST'
        });
        showToast(`🚫 Пользователь ${userId} забанен`, 'info');
        document.getElementById('banUserId').value = '';
        document.getElementById('banReason').value = '';
        loadBannedUsers();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

async function unbanUser(userId) {
    if (!confirm(`Разбанить ${userId}?`)) return;
    try {
        await apiRequest(`/api/banned/${userId}`, { method: 'DELETE' });
        showToast(`✅ Пользователь ${userId} разбанен`, 'success');
        loadBannedUsers();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

// ========================================
// АДМИН: НАСТРОЙКИ
// ========================================
async function loadSettings() {
    try {
        const data = await apiRequest('/api/settings');
        if (data) {
            const map = {
                settingShopName: data.shop_name || '',
                settingShopDesc: data.shop_description || '',
                settingContactManager: data.contact_manager || '@ManaReaper',
                settingDelivery: data.delivery_info || '',
                settingPayment: data.payment_info || '',
                settingMaintenance: data.maintenance_mode || 'false',
                settingReviewsChannel: data.reviews_channel || ''
            };
            Object.keys(map).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = map[id];
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
    }
}

async function saveSettings() {
    const data = {
        shop_name: document.getElementById('settingShopName').value.trim(),
        shop_description: document.getElementById('settingShopDesc').value.trim(),
        contact_manager: document.getElementById('settingContactManager').value.trim(),
        delivery_info: document.getElementById('settingDelivery').value.trim(),
        payment_info: document.getElementById('settingPayment').value.trim(),
        maintenance_mode: document.getElementById('settingMaintenance').value,
        reviews_channel: document.getElementById('settingReviewsChannel').value.trim()
    };
    
    try {
        await apiRequest('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        showToast('💾 Настройки сохранены', 'success');
    } catch (error) {
        showToast('Ошибка сохранения', 'error');
    }
}

// ========================================
// АДМИН: ОТЗЫВЫ
// ========================================
async function loadAdminReviews() {
    const list = document.getElementById('adminReviewsList');
    if (!list) return;
    try {
        const data = await apiRequest('/api/reviews');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Отзывов нет</p></div>';
            return;
        }
        list.innerHTML = data.map(r => `
            <div class="list-item">
                <div class="list-item-info">
                    <div class="list-item-title">⭐ ${r.rating}/5 — ${r.username || 'Аноним'}</div>
                    <div class="list-item-sub">${escapeHtml(r.text)}</div>
                    ${r.product_id ? `<div class="list-item-sub">🆔 Товар #${r.product_id}</div>` : ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

// ========================================
// РАССЫЛКА
// ========================================
function openSendAll() {
    const modal = document.getElementById('sendAllModal');
    if (modal) modal.classList.add('open');
}

function closeSendAll() {
    const modal = document.getElementById('sendAllModal');
    if (modal) {
        modal.classList.remove('open');
        const text = document.getElementById('sendAllText');
        if (text) text.value = '';
    }
}

async function sendAll() {
    const text = document.getElementById('sendAllText')?.value.trim();
    if (!text) {
        showToast('Введите текст рассылки', 'error');
        return;
    }
    
    if (!confirm(`Отправить рассылку ${text.length} символов всем пользователям?`)) return;
    
    try {
        await apiRequest('/api/send_all', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
        showToast('📨 Рассылка отправлена!', 'success');
        closeSendAll();
    } catch (error) {
        showToast('Ошибка отправки', 'error');
    }
}

// ========================================
// ИНИЦИАЛИЗАЦИЯ
// ========================================
async function init() {
    tg.ready();
    
    await loadCategories();
    await loadProducts(true);
    await loadCart();
    
    showAdminButton();
    
    // ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
    searchToggle?.addEventListener('click', toggleSearch);
    searchClear?.addEventListener('click', clearSearch);
    
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 0;
            hasMore = true;
            productsGrid.innerHTML = '';
            loadProducts(true);
            searchContainer.classList.remove('open');
        }
    });
    
    cartBtn?.addEventListener('click', openCart);
    cartClose?.addEventListener('click', closeCart);
    cartOverlay?.addEventListener('click', closeCart);
    checkoutBtn?.addEventListener('click', checkoutFromCart);
    
    modalClose?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    orderModalClose?.addEventListener('click', closeOrderModal);
    orderModalOverlay?.addEventListener('click', (e) => {
        if (e.target === orderModalOverlay) closeOrderModal();
    });
    orderCloseBtn?.addEventListener('click', closeOrderModal);
    submitOrderBtn?.addEventListener('click', submitOrder);
    promoApplyBtn?.addEventListener('click', applyPromo);
    orderPromo?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyPromo();
    });
    
    loadMoreBtn?.addEventListener('click', loadMore);
    
    // ===== АДМИН-КНОПКИ =====
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    document.getElementById('addProductBtn')?.addEventListener('click', toggleProductForm);
    document.getElementById('productFormCancel')?.addEventListener('click', toggleProductForm);
    document.getElementById('productFormSubmit')?.addEventListener('click', saveProduct);
    
    document.getElementById('addCategoryBtn')?.addEventListener('click', toggleCategoryForm);
    document.getElementById('categoryFormCancel')?.addEventListener('click', toggleCategoryForm);
    document.getElementById('categoryFormSubmit')?.addEventListener('click', saveCategory);
    
    document.getElementById('addPromoBtn')?.addEventListener('click', togglePromoForm);
    document.getElementById('promoFormCancel')?.addEventListener('click', togglePromoForm);
    document.getElementById('promoFormSubmit')?.addEventListener('click', savePromo);
    
    document.getElementById('addFaqBtn')?.addEventListener('click', toggleFaqForm);
    document.getElementById('faqFormCancel')?.addEventListener('click', toggleFaqForm);
    document.getElementById('faqFormSubmit')?.addEventListener('click', saveFaq);
    
    document.getElementById('banUserBtn')?.addEventListener('click', banUser);
    document.getElementById('settingsSaveBtn')?.addEventListener('click', saveSettings);
    document.getElementById('sendAllBtn')?.addEventListener('click', openSendAll);
    document.getElementById('sendAllClose')?.addEventListener('click', closeSendAll);
    document.getElementById('sendAllSubmit')?.addEventListener('click', sendAll);
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        switchTab(adminTab);
        showToast('🔄 Обновлено', 'info');
    });
    
    document.getElementById('adminSearchInput')?.addEventListener('input', () => {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(loadAdminProducts, 300);
    });
    document.getElementById('adminCategoryFilter')?.addEventListener('change', loadAdminProducts);
    document.getElementById('orderStatusFilter')?.addEventListener('change', loadAdminOrders);
    
    document.getElementById('confirmCancel')?.addEventListener('click', () => {
        document.getElementById('confirmModal')?.classList.remove('open');
    });
    document.getElementById('confirmOk')?.addEventListener('click', () => {
        document.getElementById('confirmModal')?.classList.remove('open');
        if (window._confirmAction) {
            window._confirmAction();
            window._confirmAction = null;
        }
    });
    
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get('start');
    if (startParam && startParam.startsWith('product_')) {
        const productId = parseInt(startParam.replace('product_', ''));
        if (productId) {
            setTimeout(() => openProduct(productId), 500);
        }
    }
    
    // Если открыта админка — грузим дашборд
    if (window.location.pathname.includes('/admin')) {
        switchTab('dashboard');
    }
    
    console.log('🚀 FAKESHOP Mini App инициализирован');
    console.log(`👤 User ID: ${USER_ID}`);
    console.log(`👑 Админ: ${isAdmin() ? 'ДА' : 'НЕТ'}`);
}

// Запуск
document.addEventListener('DOMContentLoaded', init);
