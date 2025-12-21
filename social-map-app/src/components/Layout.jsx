import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function Layout() {
    return (
        <div style={{ paddingBottom: 60 }}> {/* Pad content to not be hidden by nav */}
            <Outlet />
            <BottomNav />
        </div>
    );
}
