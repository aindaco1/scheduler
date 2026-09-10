# Deployment identity comes from Wrangler through scripts/build.mjs.
Jekyll::Hooks.register :site, :post_read do |site|
  deployment = site.data.fetch('deployment')
  site.config['url'] = deployment.fetch('origin')
  site.pages.each do |page|
    next unless page.data['app'] == 'booking'
    spanish = page.data['lang'] == 'es'
    page.data['permalink'] = "#{spanish ? '/es' : ''}/#{deployment.fetch('slug')}"
    page.data['title'] = "#{spanish ? 'Reserva con' : 'Book with'} #{deployment.fetch('name')}"
  end
end
