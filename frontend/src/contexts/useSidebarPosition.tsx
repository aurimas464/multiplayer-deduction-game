import { useState, useEffect } from 'react';

type SidebarPosition = {
	right: number;
	isExpanded: boolean;
}

export const useSidebarPosition = (): SidebarPosition => {
	const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>({
		right: 0,
		isExpanded: false,
	});

	useEffect(() => {
		const updateSidebarPosition = () => {
			const sidebar = document.querySelector('.sidebar');
			if (!sidebar) return;

			const sidebarRect = sidebar.getBoundingClientRect();
			const isExpanded = sidebar.classList.contains('expanded');

			// Calculate the right position based on the sidebar's right edge
			const right = sidebarRect.right;

			// Only update if the position has actually changed
			setSidebarPosition(prev => {
				if (prev.right !== right || prev.isExpanded !== isExpanded) {
					return {
						right,
						isExpanded,
					};
				}
				return prev;
			});
		};

		// Update position when component mounts
		updateSidebarPosition();

		// Create mutation observer for class changes (expanded/collapsed)
		const sidebar = document.querySelector('.sidebar');
		if (sidebar) {
			const mutationObserver = new MutationObserver(mutations => {
				mutations.forEach(mutation => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
						// Use requestAnimationFrame for smoother updates
						requestAnimationFrame(updateSidebarPosition);
					}
				});
			});
			mutationObserver.observe(sidebar, { attributes: true });

			// Also listen for window resize events to update position
			const handleResize = () => {
				requestAnimationFrame(updateSidebarPosition);
			};
			window.addEventListener('resize', handleResize);

			const intervalId = setInterval(() => {
				requestAnimationFrame(updateSidebarPosition);
			}, 10);
			requestAnimationFrame(updateSidebarPosition);

			// Clean up
			return () => {
				mutationObserver.disconnect();
				window.removeEventListener('resize', handleResize);
				clearInterval(intervalId);
			};
		}
	}, []);

	return sidebarPosition;
};
