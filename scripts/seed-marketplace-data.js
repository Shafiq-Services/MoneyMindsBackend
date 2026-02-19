require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Marketplace = require('../models/marketplace');
const connectDB = require('../config/db');

// Marketplace data with reliable brand logo URLs from CDN/online sources
const marketplaceData = [
  {
    title: 'Shippo',
    description: 'Shipping made simple. Get discounted shipping rates for your business.',
    image: 'https://logos-world.net/wp-content/uploads/2021/02/Shippo-Logo.png',
    discount: 20,
    discountCode: 'MONEYMINDS20',
    link: 'https://goshippo.com',
    isActive: true
  },
  {
    title: 'ZenBusiness',
    description: 'Start and grow your business with ease. LLC formation and business services.',
    image: 'https://logos-world.net/wp-content/uploads/2021/11/ZenBusiness-Logo.png',
    discount: 25,
    discountCode: 'MONEYMINDS25',
    link: 'https://zenbusiness.com',
    isActive: true
  },
  {
    title: 'Money Minds Exclusive Deal',
    description: 'Special discount for Money Minds members. Use code at checkout.',
    image: 'https://logos-world.net/wp-content/uploads/2020/11/Discount-Logo.png',
    discount: 30,
    discountCode: 'MONEYMINDS30',
    link: 'https://moneyminds.com/deals',
    isActive: true
  },
  {
    title: 'Zendrop',
    description: 'Dropshipping automation platform. Source products and automate fulfillment.',
    image: 'https://logos-world.net/wp-content/uploads/2021/11/Zendrop-Logo.png',
    discount: 15,
    discountCode: 'MONEYMINDS15',
    link: 'https://zendrop.com',
    isActive: true
  },
  {
    title: 'Grammarly',
    description: 'Write with confidence. AI-powered writing assistant for better communication.',
    image: 'https://logos-world.net/wp-content/uploads/2021/02/Grammarly-Logo.png',
    discount: 20,
    discountCode: 'MONEYMINDS20',
    link: 'https://grammarly.com',
    isActive: true
  },
  {
    title: 'DSers',
    description: 'AliExpress dropshipping tool. Manage orders and automate your store.',
    image: 'https://logos-world.net/wp-content/uploads/2021/11/DSers-Logo.png',
    discount: 18,
    discountCode: 'MONEYMINDS18',
    link: 'https://dsers.com',
    isActive: true
  },
  {
    title: 'Reacher',
    description: 'Email verification API. Verify email addresses and improve deliverability.',
    image: 'https://cdn.simpleicons.org/gmail/EA4335',
    discount: 22,
    discountCode: 'MONEYMINDS22',
    link: 'https://reacher.email',
    isActive: true
  },
  {
    title: 'Tailor Brands',
    description: 'AI-powered logo and branding design. Create professional brand identity.',
    image: 'https://logos-world.net/wp-content/uploads/2021/02/Tailor-Brands-Logo.png',
    discount: 25,
    discountCode: 'MONEYMINDS25',
    link: 'https://tailorbrands.com',
    isActive: true
  },
  {
    title: 'WinningHunter',
    description: 'Product research tool for Amazon sellers. Find winning products to sell.',
    image: 'https://logos-world.net/wp-content/uploads/2020/04/Amazon-Logo.png',
    discount: 20,
    discountCode: 'MONEYMINDS20',
    link: 'https://winninghunter.com',
    isActive: true
  },
  {
    title: 'Paired',
    description: 'Design collaboration tool. Work together on creative projects seamlessly.',
    image: 'https://cdn.simpleicons.org/figma/F24E1E',
    discount: 15,
    discountCode: 'MONEYMINDS15',
    link: 'https://paired.com',
    isActive: true
  },
  {
    title: 'Billo',
    description: 'Video creation platform. Create professional product videos for your business.',
    image: 'https://cdn.simpleicons.org/youtube/FF0000',
    discount: 20,
    discountCode: 'MONEYMINDS20',
    link: 'https://billo.app',
    isActive: true
  },
  {
    title: 'Fiverr',
    description: 'Find freelancers for any project. Hire talented professionals worldwide.',
    image: 'https://logos-world.net/wp-content/uploads/2020/11/Fiverr-Logo.png',
    discount: 10,
    discountCode: 'MONEYMINDS10',
    link: 'https://fiverr.com',
    isActive: true
  },
  {
    title: 'Shopify',
    description: 'Build your online store. Complete e-commerce platform for entrepreneurs.',
    image: 'https://logos-world.net/wp-content/uploads/2020/11/Shopify-Logo.png',
    discount: 14,
    discountCode: 'MONEYMINDS14',
    link: 'https://shopify.com',
    isActive: true
  },
  {
    title: 'LiveRecover',
    description: 'Customer service automation. Recover abandoned carts and boost sales.',
    image: 'https://cdn.simpleicons.org/zendesk/03363D',
    discount: 25,
    discountCode: 'MONEYMINDS25',
    link: 'https://liverecover.com',
    isActive: true
  },
  {
    title: 'Shrine Theme',
    description: 'Premium Shopify theme. Beautiful design for your online store.',
    image: 'https://cdn.simpleicons.org/shopify/96BF48',
    discount: 30,
    discountCode: 'MONEYMINDS30',
    link: 'https://shrinetheme.com',
    isActive: true
  },
  {
    title: 'AfterLib',
    description: 'Digital asset library. Access premium templates and resources.',
    image: 'https://cdn.simpleicons.org/googledrive/4285F4',
    discount: 20,
    discountCode: 'MONEYMINDS20',
    link: 'https://afterlib.com',
    isActive: true
  },
  {
    title: 'Monday.com',
    description: 'Work management platform. Organize teams and projects efficiently.',
    image: 'https://logos-world.net/wp-content/uploads/2021/02/Monday-Logo.png',
    discount: 18,
    discountCode: 'MONEYMINDS18',
    link: 'https://monday.com',
    isActive: true
  },
  {
    title: 'AliDropship',
    description: 'WordPress dropshipping plugin. Turn your site into a dropshipping store.',
    image: 'https://cdn.simpleicons.org/wordpress/21759B',
    discount: 22,
    discountCode: 'MONEYMINDS22',
    link: 'https://alidropship.com',
    isActive: true
  },
  {
    title: 'Jungle Scout',
    description: 'Amazon product research tool. Find profitable products to sell on Amazon.',
    image: 'https://logos-world.net/wp-content/uploads/2021/02/Jungle-Scout-Logo.png',
    discount: 20,
    discountCode: 'MONEYMINDS20',
    link: 'https://junglescout.com',
    isActive: true
  },
  {
    title: 'Carbon 6',
    description: 'E-commerce growth platform. Tools and services to scale your online business.',
    image: 'https://cdn.simpleicons.org/shopify/96BF48',
    discount: 25,
    discountCode: 'MONEYMINDS25',
    link: 'https://carbon6.com',
    isActive: true
  }
];

async function seedMarketplaceData() {
  await connectDB();

  try {
    console.log('🛒 Starting marketplace data seeding...\n');

    // Delete all existing marketplace entries
    const deletedCount = await Marketplace.deleteMany({});
    console.log(`🗑️  Deleted ${deletedCount.deletedCount} existing marketplace entries\n`);

    // Create new marketplace entries
    const createdMarketplaces = [];
    for (const marketplaceItem of marketplaceData) {
      const marketplace = await Marketplace.create(marketplaceItem);
      createdMarketplaces.push(marketplace);
      console.log(`✅ Created: ${marketplace.title} - ${marketplace.discount}% OFF (Code: ${marketplace.discountCode})`);
    }

    console.log(`\n✅ Successfully seeded ${createdMarketplaces.length} marketplace entries!\n`);
    console.log('📋 Summary:');
    console.log(`   Total Partners: ${createdMarketplaces.length}`);
    console.log(`   Active Offers: ${createdMarketplaces.filter(m => m.isActive).length}`);
    console.log(`   Average Discount: ${Math.round(createdMarketplaces.reduce((sum, m) => sum + m.discount, 0) / createdMarketplaces.length)}%`);
    console.log('\n🚀 Marketplace data is ready!\n');

  } catch (error) {
    console.error('❌ Error seeding marketplace data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

seedMarketplaceData();
