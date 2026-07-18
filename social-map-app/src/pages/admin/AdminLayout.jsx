import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import './Admin.css';

export default function AdminLayout() {
    const navigate = useNavigate();

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <div className="admin-sidebar-header">
                    <h2>Nearo Admin</h2>
                </div>
                <nav className="admin-nav">
                    <NavLink to="/admin" end className={({isActive}) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
                        <span className="icon">📊</span> Dashboard
                    </NavLink>
                    <NavLink to="/admin/reports" className={({isActive}) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
                        <span className="icon">🚩</span> Reports
                    </NavLink>
                    <NavLink to="/admin/users" className={({isActive}) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}>
                        <span className="icon">👥</span> Users
                    </NavLink>
                </nav>
                <div className="admin-sidebar-footer">
                    <button className="btn-exit-admin" onClick={() => navigate('/map')}>
                        Exit Admin
                    </button>
                </div>
            </aside>
            <main className="admin-main-content">
                <header className="admin-topbar">
                    <h3>Moderation Dashboard</h3>
                </header>
                <div className="admin-content-scroll">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
