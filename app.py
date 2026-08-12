import os
import sqlite3
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv
import re

load_dotenv()

PORT = int(os.getenv("PORT", 8000))
ADMIN_IDS = [1886614664, 8814572765]  # Ты и второй админ

# ========== ЛОГИ ==========
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========== БД ==========
DB_NAME = "fakeshop.db"

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Инициализация всех таблиц"""
    conn = get_db()
    cur = conn.cursor()
    
    # Товары
    cur.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        photo TEXT,
        note TEXT,
        category TEXT DEFAULT 'Все',
        from_china INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Заявки (заказы)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        address TEXT,
        contact TEXT,
        product_ids TEXT NOT NULL,
        quantities TEXT,
        total REAL NOT NULL,
        discount REAL DEFAULT 0,
        final_total REAL NOT NULL,
        promocode TEXT,
        status TEXT DEFAULT 'new',
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Корзина
    cur.execute("""
    CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
    )
    """)
    
    # Категории
    cur.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        icon TEXT,
        sort_order INTEGER DEFAULT 0
    )
    """)
    
    # Добавляем категории по умолчанию
    default_categories = ['Все', 'Футболки', 'Свитшоты', 'Кроссовки', 'Штаны', 'Аксессуары', 'Из Китая']
    for cat in default_categories:
        cur.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (cat,))
    
    # Промокоды
    cur.execute("""
    CREATE TABLE IF NOT EXISTS promocodes (
        code TEXT PRIMARY KEY,
        discount INTEGER NOT NULL,
        min_order REAL DEFAULT 0,
        uses_limit INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Бан-лист
    cur.execute("""
    CREATE TABLE IF NOT EXISTS banned_users (
        user_id INTEGER PRIMARY KEY,
        reason TEXT,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # FAQ
    cur.execute("""
    CREATE TABLE IF NOT EXISTS faq (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Отзывы (локальные)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        text TEXT,
        product_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Настройки
    cur.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Настройки по умолчанию
    default_settings = {
        'shop_name': 'FAKESHOP',
        'shop_description': 'Стильная одежда и обувь',
        'maintenance_mode': 'false',
        'contact_manager': '@ManaReaper',
        'delivery_info': 'Доставка по всей стране',
        'payment_info': 'Оплата при получении',
        'reviews_channel': '@TestimonialFAKESTORE'
    }
    for key, value in default_settings.items():
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))
    
    conn.commit()
    conn.close()
    logger.info("База данных инициализирована")

init_db()

# ========== PYDANTIC МОДЕЛИ ==========
class ProductCreate(BaseModel):
    name: str
    price: float
    quantity: int
    note: Optional[str] = ""
    category: Optional[str] = "Все"
    photo: Optional[str] = None
    from_china: Optional[int] = 0

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    note: Optional[str] = None
    category: Optional[str] = None
    photo: Optional[str] = None
    from_china: Optional[int] = None

class CartItem(BaseModel):
    product_id: int
    quantity: int = 1

class OrderCreate(BaseModel):
    user_id: int
    username: Optional[str] = ""
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    phone: str
    address: Optional[str] = ""
    contact: str
    promocode: Optional[str] = ""
    comment: Optional[str] = ""

class PromocodeCreate(BaseModel):
    code: str
    discount: int
    min_order: float = 0
    uses_limit: int = 0
    expires_at: Optional[str] = None

class FAQCreate(BaseModel):
    question: str
    answer: str

class ReviewCreate(BaseModel):
    user_id: int
    username: Optional[str] = ""
    rating: int
    text: str
    product_id: Optional[int] = None

class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = ""
    user_id: int

class CategoryUpdate(BaseModel):
    name: str
    icon: Optional[str] = ""
    user_id: int

class SettingsUpdate(BaseModel):
    shop_name: Optional[str] = None
    shop_description: Optional[str] = None
    maintenance_mode: Optional[str] = None
    contact_manager: Optional[str] = None
    delivery_info: Optional[str] = None
    payment_info: Optional[str] = None
    reviews_channel: Optional[str] = None

# ========== FASTAPI ==========
app = FastAPI(title="FAKESHOP Mini App API", version="2.0.0")

# ========== СТАТИКА ==========
os.makedirs("frontend", exist_ok=True)
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
def generate_order_number():
    """Генерация уникального номера заказа"""
    now = datetime.now()
    return f"FAKE-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}"

def check_maintenance():
    """Проверка режима техработ"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'maintenance_mode'")
    result = cur.fetchone()
    conn.close()
    return result and result['value'] == 'true'

def check_ban(user_id: int):
    """Проверка бана пользователя"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM banned_users WHERE user_id = ?", (user_id,))
    result = cur.fetchone()
    conn.close()
    return result is not None

def is_admin(user_id: int):
    """Проверка, является ли пользователь админом"""
    return user_id in ADMIN_IDS

# ========== ОСНОВНЫЕ РОУТЫ ==========
@app.get("/")
async def index():
    """Главная страница"""
    try:
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("<h1>🔥 FAKESHOP</h1><p>Загрузите index.html в папку frontend</p>")

@app.get("/admin")
async def admin_panel():
    """Админ-панель"""
    try:
        with open("frontend/admin.html", "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("<h1>👑 Админ-панель</h1><p>Загрузите admin.html в папку frontend</p>")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# ========== НАСТРОЙКИ ==========
@app.get("/api/settings")
async def get_settings():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings")
    settings = {row['key']: row['value'] for row in cur.fetchall()}
    conn.close()
    return settings

@app.put("/api/settings")
async def update_settings(data: SettingsUpdate):
    conn = get_db()
    cur = conn.cursor()
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        cur.execute(
            "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
            (value, key)
        )
    conn.commit()
    conn.close()
    return {"message": "Настройки обновлены"}

# ========== КАТЕГОРИИ (ПОЛНЫЙ CRUD) ==========
@app.get("/api/categories")
async def get_categories():
    """Получить все категории"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM categories ORDER BY sort_order")
    categories = [dict(row) for row in cur.fetchall()]
    conn.close()
    return categories

@app.post("/api/categories")
async def create_category(data: CategoryCreate):
    """Создать категорию (только админ)"""
    if not is_admin(data.user_id):
        raise HTTPException(403, "Нет прав")
    
    name = data.name.strip()
    icon = data.icon or ""
    
    if not name:
        raise HTTPException(400, "Название категории обязательно")
    
    conn = get_db()
    cur = conn.cursor()
    
    # Проверяем, есть ли уже такая категория
    cur.execute("SELECT id FROM categories WHERE name = ?", (name,))
    if cur.fetchone():
        conn.close()
        raise HTTPException(400, "Категория с таким названием уже существует")
    
    cur.execute(
        "INSERT INTO categories (name, icon) VALUES (?, ?)",
        (name, icon)
    )
    conn.commit()
    category_id = cur.lastrowid
    conn.close()
    
    return {"id": category_id, "message": f"Категория '{name}' создана"}

@app.put("/api/categories/{category_id}")
async def update_category(category_id: int, data: CategoryUpdate):
    """Изменить категорию (только админ)"""
    if not is_admin(data.user_id):
        raise HTTPException(403, "Нет прав")
    
    name = data.name.strip()
    icon = data.icon or ""
    
    if not name:
        raise HTTPException(400, "Название категории обязательно")
    
    conn = get_db()
    cur = conn.cursor()
    
    # Проверяем, существует ли категория
    cur.execute("SELECT id FROM categories WHERE id = ?", (category_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Категория не найдена")
    
    # Проверяем, не занято ли имя другой категорией
    cur.execute("SELECT id FROM categories WHERE name = ? AND id != ?", (name, category_id))
    if cur.fetchone():
        conn.close()
        raise HTTPException(400, "Категория с таким названием уже существует")
    
    cur.execute(
        "UPDATE categories SET name = ?, icon = ? WHERE id = ?",
        (name, icon, category_id)
    )
    conn.commit()
    conn.close()
    
    return {"message": f"Категория обновлена"}

@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: int, user_id: int):
    """Удалить категорию (только админ)"""
    if not is_admin(user_id):
        raise HTTPException(403, "Нет прав")
    
    conn = get_db()
    cur = conn.cursor()
    
    # Проверяем, существует ли категория
    cur.execute("SELECT name FROM categories WHERE id = ?", (category_id,))
    category = cur.fetchone()
    if not category:
        conn.close()
        raise HTTPException(404, "Категория не найдена")
    
    # Не даём удалить категорию "Все"
    if category['name'] == 'Все':
        conn.close()
        raise HTTPException(400, "Нельзя удалить категорию 'Все'")
    
    # Обновляем товары с этой категорией на "Все"
    cur.execute("UPDATE products SET category = 'Все' WHERE category = ?", (category['name'],))
    
    cur.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    conn.commit()
    conn.close()
    
    return {"message": f"Категория '{category['name']}' удалена"}

# ========== ТОВАРЫ ==========
@app.get("/api/products")
async def get_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    from_china: Optional[int] = None,
    limit: int = 50,
    offset: int = 0
):
    """Получение товаров с фильтрацией"""
    conn = get_db()
    cur = conn.cursor()
    
    query = "SELECT * FROM products WHERE 1=1"
    params = []
    
    if category and category != "Все":
        query += " AND category = ?"
        params.append(category)
    
    if search:
        query += " AND name LIKE ?"
        params.append(f"%{search}%")
    
    if from_china is not None:
        query += " AND from_china = ?"
        params.append(from_china)
    
    if sort == "price_asc":
        query += " ORDER BY price ASC"
    elif sort == "price_desc":
        query += " ORDER BY price DESC"
    elif sort == "newest":
        query += " ORDER BY id DESC"
    else:
        query += " ORDER BY id DESC"
    
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    cur.execute(query, params)
    products = [dict(row) for row in cur.fetchall()]
    
    # Общее количество
    count_query = "SELECT COUNT(*) as total FROM products WHERE 1=1"
    count_params = []
    if category and category != "Все":
        count_query += " AND category = ?"
        count_params.append(category)
    if search:
        count_query += " AND name LIKE ?"
        count_params.append(f"%{search}%")
    if from_china is not None:
        count_query += " AND from_china = ?"
        count_params.append(from_china)
    
    cur.execute(count_query, count_params)
    total = cur.fetchone()['total']
    
    conn.close()
    return {
        "products": products,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@app.get("/api/products/{product_id}")
async def get_product(product_id: int):
    """Карточка товара"""
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("UPDATE products SET views = views + 1 WHERE id = ?", (product_id,))
    cur.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = cur.fetchone()
    conn.commit()
    conn.close()
    
    if not product:
        raise HTTPException(404, "Товар не найден")
    return dict(product)

@app.post("/api/products")
async def create_product(data: ProductCreate):
    """Создание товара (только админ)"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO products (name, price, quantity, note, category, photo, from_china)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (data.name, data.price, data.quantity, data.note, data.category, data.photo, data.from_china or 0)
    )
    conn.commit()
    product_id = cur.lastrowid
    conn.close()
    return {"id": product_id, "message": "Товар создан"}

@app.put("/api/products/{product_id}")
async def update_product(product_id: int, data: ProductUpdate):
    """Обновление товара (только админ)"""
    conn = get_db()
    cur = conn.cursor()
    
    fields = []
    values = []
    
    if data.name is not None:
        fields.append("name = ?")
        values.append(data.name)
    if data.price is not None:
        fields.append("price = ?")
        values.append(data.price)
    if data.quantity is not None:
        fields.append("quantity = ?")
        values.append(data.quantity)
    if data.note is not None:
        fields.append("note = ?")
        values.append(data.note)
    if data.category is not None:
        fields.append("category = ?")
        values.append(data.category)
    if data.photo is not None:
        fields.append("photo = ?")
        values.append(data.photo)
    if data.from_china is not None:
        fields.append("from_china = ?")
        values.append(data.from_china)
    
    if not fields:
        raise HTTPException(400, "Нет полей для обновления")
    
    values.append(product_id)
    cur.execute(f"UPDATE products SET {', '.join(fields)} WHERE id = ?", values)
    conn.commit()
    conn.close()
    
    return {"message": "Товар обновлен"}

@app.delete("/api/products/{product_id}")
async def delete_product(product_id: int):
    """Удаление товара (только админ)"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    return {"message": "Товар удален"}

# ========== КОРЗИНА ==========
@app.get("/api/cart/{user_id}")
async def get_cart(user_id: int):
    """Получение корзины"""
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("""
        SELECT c.*, p.name, p.price, p.photo, p.quantity as stock
        FROM cart c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?
    """, (user_id,))
    
    cart_items = []
    total = 0
    for row in cur.fetchall():
        item = dict(row)
        item['subtotal'] = item['price'] * item['quantity']
        total += item['subtotal']
        cart_items.append(item)
    
    conn.close()
    return {
        "items": cart_items,
        "total": total,
        "count": len(cart_items)
    }

@app.post("/api/cart/{user_id}")
async def add_to_cart(user_id: int, data: CartItem):
    """Добавление в корзину"""
    if check_ban(user_id):
        raise HTTPException(403, "Вы забанены")
    
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT quantity FROM products WHERE id = ?", (data.product_id,))
    product = cur.fetchone()
    if not product:
        raise HTTPException(404, "Товар не найден")
    if product['quantity'] < data.quantity:
        raise HTTPException(400, "Недостаточно товара на складе")
    
    cur.execute(
        """INSERT INTO cart (user_id, product_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, product_id)
        DO UPDATE SET quantity = quantity + ?""",
        (user_id, data.product_id, data.quantity, data.quantity)
    )
    conn.commit()
    conn.close()
    
    return {"message": "Товар добавлен в корзину"}

@app.delete("/api/cart/{user_id}/{product_id}")
async def remove_from_cart(user_id: int, product_id: int):
    """Удаление из корзины"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM cart WHERE user_id = ? AND product_id = ?", (user_id, product_id))
    conn.commit()
    conn.close()
    return {"message": "Товар удален из корзины"}

@app.delete("/api/cart/{user_id}")
async def clear_cart(user_id: int):
    """Очистка корзины"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM cart WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": "Корзина очищена"}

# ========== ЗАЯВКИ (ЗАКАЗЫ) ==========
@app.post("/api/orders")
async def create_order(data: OrderCreate):
    """Создание заявки"""
    if check_maintenance():
        raise HTTPException(503, "Магазин на технических работах")
    
    if check_ban(data.user_id):
        raise HTTPException(403, "Вы забанены")
    
    conn = get_db()
    cur = conn.cursor()
    
    # Получаем корзину
    cur.execute("""
        SELECT c.product_id, c.quantity, p.price, p.name
        FROM cart c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?
    """, (data.user_id,))
    
    cart_items = cur.fetchall()
    if not cart_items:
        raise HTTPException(400, "Корзина пуста")
    
    product_ids = []
    quantities = []
    total = 0
    
    for item in cart_items:
        product_ids.append(str(item['product_id']))
        quantities.append(str(item['quantity']))
        total += item['price'] * item['quantity']
    
    # Применяем промокод
    final_total = total
    discount = 0
    if data.promocode:
        cur.execute(
            """SELECT * FROM promocodes
            WHERE code = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)""",
            (data.promocode.upper(),)
        )
        promo = cur.fetchone()
        if promo:
            discount = (total * promo['discount']) / 100
            final_total = total - discount
            cur.execute(
                "UPDATE promocodes SET used_count = used_count + 1 WHERE code = ?",
                (data.promocode.upper(),)
            )
    
    order_number = generate_order_number()
    
    cur.execute("""
        INSERT INTO orders (
            order_number, user_id, username, first_name, last_name,
            phone, address, contact, product_ids, quantities,
            total, discount, final_total, promocode, comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        order_number, data.user_id, data.username, data.first_name, data.last_name,
        data.phone, data.address, data.contact,
        ",".join(product_ids), ",".join(quantities),
        total, discount, final_total, data.promocode.upper() if data.promocode else None,
        data.comment
    ))
    
    order_id = cur.lastrowid
    
    # Уменьшаем количество товаров
    for item in cart_items:
        cur.execute(
            "UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?",
            (item['quantity'], item['product_id'], item['quantity'])
        )
    
    # Очищаем корзину
    cur.execute("DELETE FROM cart WHERE user_id = ?", (data.user_id,))
    
    conn.commit()
    conn.close()
    
    return {
        "order_id": order_id,
        "order_number": order_number,
        "total": total,
        "discount": discount,
        "final_total": final_total,
        "message": "Заявка создана"
    }

@app.get("/api/orders")
async def get_orders(status: Optional[str] = None, limit: int = 100, offset: int = 0):
    """Получение списка заявок (админ)"""
    conn = get_db()
    cur = conn.cursor()
    
    query = "SELECT * FROM orders"
    params = []
    if status and status != 'all':
        query += " WHERE status = ?"
        params.append(status)
    
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    cur.execute(query, params)
    orders = [dict(row) for row in cur.fetchall()]
    conn.close()
    return orders

@app.get("/api/orders/{order_id}")
async def get_order(order_id: int):
    """Получение конкретной заявки"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    order = cur.fetchone()
    conn.close()
    if not order:
        raise HTTPException(404, "Заявка не найдена")
    return dict(order)

@app.put("/api/orders/{order_id}/status")
async def update_order_status(order_id: int, status: str):
    """Обновление статуса заявки"""
    valid_statuses = ['new', 'processing', 'completed', 'cancelled']
    if status not in valid_statuses:
        raise HTTPException(400, f"Неверный статус")
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, order_id)
    )
    conn.commit()
    conn.close()
    return {"message": f"Статус обновлен на {status}"}

@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: int):
    """Удаление заявки (обработано)"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()
    return {"message": "Заявка удалена"}

# ========== ПРОМОКОДЫ ==========
@app.get("/api/promocodes")
async def get_promocodes():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM promocodes ORDER BY created_at DESC")
    promocodes = [dict(row) for row in cur.fetchall()]
    conn.close()
    return promocodes

@app.post("/api/promocodes")
async def create_promocode(data: PromocodeCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO promocodes (code, discount, min_order, uses_limit, expires_at)
        VALUES (?, ?, ?, ?, ?)""",
        (data.code.upper(), data.discount, data.min_order, data.uses_limit, data.expires_at)
    )
    conn.commit()
    conn.close()
    return {"message": "Промокод создан"}

@app.delete("/api/promocodes/{code}")
async def delete_promocode(code: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM promocodes WHERE code = ?", (code.upper(),))
    conn.commit()
    conn.close()
    return {"message": "Промокод удален"}

@app.post("/api/promocodes/{code}/validate")
async def validate_promocode(code: str, total: float):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """SELECT * FROM promocodes
        WHERE code = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        AND (uses_limit = 0 OR used_count < uses_limit)""",
        (code.upper(),)
    )
    promo = cur.fetchone()
    conn.close()
    
    if not promo:
        raise HTTPException(404, "Промокод недействителен")
    
    if total < promo['min_order']:
        raise HTTPException(400, f"Минимальная сумма заказа: {promo['min_order']}")
    
    return {
        "code": promo['code'],
        "discount": promo['discount'],
        "discount_amount": (total * promo['discount']) / 100,
        "valid": True
    }

# ========== БАН-СИСТЕМА ==========
@app.get("/api/banned")
async def get_banned_users():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM banned_users ORDER BY banned_at DESC")
    banned = [dict(row) for row in cur.fetchall()]
    conn.close()
    return banned

@app.post("/api/banned/{user_id}")
async def ban_user(user_id: int, reason: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO banned_users (user_id, reason) VALUES (?, ?)",
        (user_id, reason or "Нарушение правил")
    )
    conn.commit()
    conn.close()
    return {"message": f"Пользователь {user_id} забанен"}

@app.delete("/api/banned/{user_id}")
async def unban_user(user_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM banned_users WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": f"Пользователь {user_id} разбанен"}

# ========== FAQ ==========
@app.get("/api/faq")
async def get_faq():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM faq ORDER BY sort_order")
    faq = [dict(row) for row in cur.fetchall()]
    conn.close()
    return faq

@app.post("/api/faq")
async def create_faq(data: FAQCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO faq (question, answer) VALUES (?, ?)",
        (data.question, data.answer)
    )
    conn.commit()
    conn.close()
    return {"message": "FAQ добавлен"}

@app.delete("/api/faq/{faq_id}")
async def delete_faq(faq_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM faq WHERE id = ?", (faq_id,))
    conn.commit()
    conn.close()
    return {"message": "FAQ удален"}

# ========== ОТЗЫВЫ ==========
@app.get("/api/reviews")
async def get_reviews(product_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    if product_id:
        cur.execute("SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC", (product_id,))
    else:
        cur.execute("SELECT * FROM reviews ORDER BY created_at DESC")
    reviews = [dict(row) for row in cur.fetchall()]
    conn.close()
    return reviews

@app.post("/api/reviews")
async def create_review(data: ReviewCreate):
    if check_ban(data.user_id):
        raise HTTPException(403, "Вы забанены")
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO reviews (user_id, username, rating, text, product_id)
        VALUES (?, ?, ?, ?, ?)""",
        (data.user_id, data.username, data.rating, data.text, data.product_id)
    )
    conn.commit()
    conn.close()
    return {"message": "Отзыв создан"}

# ========== СТАТИСТИКА ==========
@app.get("/api/stats")
async def get_stats():
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT COUNT(*) as total_products FROM products")
    total_products = cur.fetchone()['total_products']
    
    cur.execute("SELECT COUNT(*) as total_orders FROM orders")
    total_orders = cur.fetchone()['total_orders']
    
    cur.execute("SELECT SUM(final_total) as total_revenue FROM orders WHERE status != 'cancelled'")
    total_revenue = cur.fetchone()['total_revenue'] or 0
    
    cur.execute("SELECT COUNT(*) as total_users FROM (SELECT DISTINCT user_id FROM orders)")
    total_users = cur.fetchone()['total_users'] or 0
    
    cur.execute("SELECT COUNT(*) as today_orders FROM orders WHERE DATE(created_at) = DATE('now')")
    today_orders = cur.fetchone()['today_orders']
    
    conn.close()
    return {
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "total_users": total_users,
        "today_orders": today_orders
    }

# ========== ЗАПУСК ==========
if __name__ == "__main__":
    logger.info(f"🚀 Запуск FAKESHOP на порту {PORT}")
    logger.info(f"👑 Админы: {ADMIN_IDS}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
